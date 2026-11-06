import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox, { Camera, CircleLayer, MapView, MarkerView, StyleImport, VectorSource } from '@rnmapbox/maps';
import type { Position } from 'geojson';
import { StatusBar } from 'expo-status-bar';

import { mapboxAccessToken, stevensCenter } from './config';
import { campusDayKey } from './campusTime';
import EventFilters from './EventFilters';
import { applyFilter, isFiltering, noFilter, type EventFilter } from './listFilters';
import { groupBySpot, loadMapEvents, type MapEvent, type Spot } from './mapEvents';
import { sheetEaseOut } from './theme';
import TopBar, { TOP_BAR_GAP, TOP_BAR_HEIGHT, type Account } from './TopBar';

if (mapboxAccessToken) {
  void Mapbox.setAccessToken(mapboxAccessToken);
  // CLAUDE.md: no analytics or third-party tracking.
  Mapbox.setTelemetryEnabled(false);
}

// Mapbox Standard draws 3D buildings and supports dawn/day/dusk/night lighting.
const standardStyle = 'mapbox://styles/mapbox/standard';

// shortcut: fixed hours, not real sunrise and sunset; switch to a sun calculation if seasons look wrong.
function lightPresetFor(hour: number): 'dawn' | 'day' | 'dusk' | 'night' {
  if (hour >= 5 && hour < 7) {
    return 'dawn';
  }
  if (hour >= 7 && hour < 17) {
    return 'day';
  }
  if (hour >= 17 && hour < 19) {
    return 'dusk';
  }
  return 'night';
}

export type PinnedPlace = { latitude: number; longitude: number; name: string | null };

type Props = {
  sessionId: string;
  refreshKey?: number;
  // Height of the sheet covering the bottom of the map. The map center, and so the pin, sits above it.
  bottomInset?: number;
  onPinMoved?: (place: PinnedPlace) => void;
  // Tapping a host bubble, or a row in a list, opens that event's detail sheet.
  onOpenEvent?: (eventId: string) => void;
  // The signed-in user, for the top bar. Absent hides the bar (while a sheet covers the map).
  account?: Account;
};

// Standard keeps its place labels inside an imported style that queries cannot reach, so an
// invisible layer loads the same Mapbox place names where the app can read them.
const placesSourceId = 'quack-places';

// Names the closest place within 60 m of the pin. No geocoding service is called.
async function placeAt(map: MapView | null, center: Position): Promise<PinnedPlace> {
  const [longitude, latitude] = center;
  let name: string | null = null;
  try {
    const found = await map?.querySourceFeatures(placesSourceId, ['has', 'name'], ['poi_label']);
    let closest = 60;
    for (const feature of found?.features ?? []) {
      if (feature.geometry.type !== 'Point' || typeof feature.properties?.name !== 'string') {
        continue;
      }
      // shortcut: flat-earth meters, accurate across one campus; use a geodesic distance if this goes multi-campus.
      const [x, y] = feature.geometry.coordinates;
      const meters = Math.hypot((x - longitude) * 111_320 * Math.cos((latitude * Math.PI) / 180), (y - latitude) * 110_540);
      if (meters < closest) {
        closest = meters;
        name = feature.properties.name;
      }
    }
  } catch {
    // No suggestion. The host types the label.
  }
  return { latitude, longitude, name };
}

export default function CampusMap({
  sessionId,
  refreshKey = 0,
  bottomInset = 0,
  onPinMoved,
  onOpenEvent,
  account,
}: Props) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  // Lookups can finish out of order; only the newest may move the pin.
  const latestLookup = useRef(0);
  const [failed, setFailed] = useState(false);
  const [lightPreset, setLightPreset] = useState(() => lightPresetFor(new Date().getHours()));
  const [day, setDay] = useState(() => campusDayKey(new Date()));
  const [bbox, setBbox] = useState<string | null>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  // False until the first query answers, so the top bar doesn't claim "0 events today" while loading.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showAll, setShowAll] = useState<Spot | null>(null);
  const [viewList, setViewList] = useState(false);
  // Lives here because the map stays mounted: kept while the app is open, not across restarts.
  const [listFilter, setListFilter] = useState<EventFilter>(noFilter);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the lighting in step with the clock while the app stays open.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setLightPreset(lightPresetFor(now.getHours()));
      setDay(campusDayKey(now));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (debounce.current) {
        clearTimeout(debounce.current);
      }
    };
  }, []);

  // The viewport string only changes after panning settles, so this does not fire per frame.
  useEffect(() => {
    if (!bbox) {
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    // Keep the current pins until the new set arrives; clearing first made them flash on every pan.
    setLoadError(false);
    setShowAll(null);
    setViewList(false);
    void loadMapEvents(sessionId, bbox, controller.signal)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setEvents(result.events);
        setLoaded(true);
        setLoadError(false);
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof Error && error.name === 'AbortError')) {
          return;
        }
        setLoadError(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bbox, day, refreshKey, sessionId]);

  function scheduleQuery(
    event: { properties: { bounds: { ne: readonly number[]; sw: readonly number[] } } },
    delay: number,
  ) {
    const { ne, sw } = event.properties.bounds;
    const next = `${sw[0]},${sw[1]},${ne[0]},${ne[1]}`;
    if (debounce.current) {
      clearTimeout(debounce.current);
    }
    if (delay === 0) {
      setBbox(next);
      return;
    }
    debounce.current = setTimeout(() => setBbox(next), delay);
  }

  if (!mapboxAccessToken) {
    return (
      <MapUnavailable detail="No Mapbox token is configured. Set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to a public pk. token in client/.env, then restart the bundler." />
    );
  }
  if (failed) {
    return <MapUnavailable detail="The map could not load. Check your connection and reopen Quack!." />;
  }
  return (
    <>
      <MapView
        ref={mapRef}
        accessibilityLabel="Map of the Stevens campus"
        onCameraChanged={(event) => scheduleQuery(event, 400)}
        onMapIdle={(state) => {
          scheduleQuery(state, 0);
          if (!onPinMoved) {
            return;
          }
          const lookup = ++latestLookup.current;
          void placeAt(mapRef.current, state.properties.center).then((place) => {
            if (lookup === latestLookup.current) {
              onPinMoved(place);
            }
          });
        }}
        // Only a style failure leaves the map blank; a missing tile or sprite does not.
        onMapLoadingError={(payload) => {
          if (!payload?.type || payload.type === 'style') {
            setFailed(true);
          }
        }}
        scaleBarEnabled={false}
        style={StyleSheet.absoluteFill}
        styleURL={standardStyle}
      >
        <StyleImport config={{ lightPreset, show3dObjects: true }} existing id="basemap" />
        <VectorSource id={placesSourceId} url="mapbox://mapbox.mapbox-streets-v8">
          <CircleLayer id="quack-places" sourceLayerID="poi_label" style={{ circleOpacity: 0, circleRadius: 1 }} />
        </VectorSource>
        {/* Tilted so the 3D buildings read as 3D. */}
        <Camera
          // Matches the sheet, so the map re-centers under the pin as the sheet settles.
          animationDuration={300}
          defaultSettings={{ centerCoordinate: stevensCenter, pitch: 45, zoomLevel: 16 }}
          padding={{ paddingBottom: bottomInset }}
        />
        {groupBySpot(events).map((spot) => (
          <MarkerView
            key={`${spot.latitude},${spot.longitude}`}
            allowOverlap
            coordinate={[spot.longitude, spot.latitude]}
          >
            <SpotBubble
              onOpen={onOpenEvent}
              onShowAll={() => setShowAll(spot)}
              spot={spot}
            />
          </MarkerView>
        ))}
      </MapView>
      {loadError ? (
        // Sits just under the top bar.
        <View
          pointerEvents="none"
          style={[styles.empty, { top: insets.top + TOP_BAR_GAP + TOP_BAR_HEIGHT + 12 }]}
        >
          <Text style={styles.errorText}>Couldn't load events. Pan the map to try again.</Text>
        </View>
      ) : null}
      {account ? (
        <TopBar account={account} count={loaded ? events.length : null} onOpenList={() => setViewList(true)} />
      ) : null}
      <EventList
        closeLabel="Close show all"
        events={showAll?.events ?? []}
        onClose={() => setShowAll(null)}
        onOpen={onOpenEvent && ((id) => {
          setShowAll(null);
          onOpenEvent(id);
        })}
        title="Show all"
        visible={showAll !== null}
      />
      <EventList
        closeLabel="Close events in this view"
        events={events}
        filter={listFilter}
        onClose={() => setViewList(false)}
        onFilterChange={setListFilter}
        onOpen={onOpenEvent && ((id) => {
          setViewList(false);
          onOpenEvent(id);
        })}
        title="Events in this view"
        visible={viewList}
      />
      <StatusBar style={lightPreset === 'dusk' || lightPreset === 'night' ? 'light' : 'dark'} />
    </>
  );
}

function SpotBubble({
  spot,
  onOpen,
  onShowAll,
}: {
  spot: Spot;
  // Absent while pinning a new event; a bubble then opens Show all, as before the detail sheet.
  onOpen?: (eventId: string) => void;
  onShowAll: () => void;
}) {
  const visible = spot.events.slice(0, 3);
  const overflow = spot.events.length > 3;
  return (
    <View style={styles.bubbles}>
      {visible.map((event, index) => (
        <Pressable
          accessibilityHint={onOpen ? 'Opens event details' : 'Shows the events here'}
          accessibilityLabel={`${event.title}, hosted by ${event.host.displayName}`}
          accessibilityRole="button"
          key={event.id}
          onPress={onOpen ? () => onOpen(event.id) : onShowAll}
        >
          <Avatar event={event} overlap={index > 0} />
        </Pressable>
      ))}
      {overflow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show all"
          onPress={onShowAll}
          style={styles.ellipsis}
        >
          <Text style={styles.ellipsisText}>...</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Avatar({ event, overlap = false }: { event: MapEvent; overlap?: boolean }) {
  const shift = overlap ? styles.overlap : null;
  if (event.host.avatarUrl) {
    return <Image accessibilityLabel={event.host.displayName} source={{ uri: event.host.avatarUrl }} style={[styles.avatar, shift]} />;
  }
  return (
    <View accessibilityLabel={event.host.displayName} style={[styles.avatarFallback, shift]}>
      <Text style={styles.fallbackText}>{event.host.displayName.slice(0, 1)}</Text>
    </View>
  );
}

function EventList({
  title,
  events,
  visible,
  closeLabel,
  onClose,
  onOpen,
  filter,
  onFilterChange,
}: {
  title: string;
  events: MapEvent[];
  visible: boolean;
  closeLabel: string;
  onClose: () => void;
  // Absent while pinning a new event; rows are then plain text.
  onOpen?: (eventId: string) => void;
  // Only the "Events in this view" list has filters.
  filter?: EventFilter;
  onFilterChange?: (filter: EventFilter) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [wasVisible, setWasVisible] = useState(visible);
  const hasFilter = Boolean(filter);

  // Refresh the clock in the same render that opens the list, so the first frame never filters
  // against the time the list was last open.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setNow(new Date());
    }
  }

  // Time windows move with the clock, so re-check them while the list is open. Depends on whether
  // there is a filter, not on the filter itself, so chip taps don't restart the timer.
  useEffect(() => {
    if (!visible || !hasFilter) {
      return;
    }
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [visible, hasFilter]);

  const shown = filter ? applyFilter(events, filter, now) : events;
  const filtered = Boolean(filter && isFiltering(filter) && events.length > 0);

  // The dim fades in place while the sheet slides up, as in Figma 04/05. With Reduce Motion, both only fade.
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const dim = useSharedValue(0);
  const offset = useSharedValue(height);

  // Runs only when the list opens or closes. Re-running on a height or Reduce Motion change would
  // restart the open animation over a close in flight, cancel it, and leave the sheet stuck open.
  const openWith = useRef({ height, reduced });
  openWith.current = { height, reduced };
  useEffect(() => {
    const { height: h, reduced: r } = openWith.current;
    if (!visible) {
      dim.set(0);
      offset.set(h);
      return;
    }
    dim.set(withTiming(1, { duration: 200 }));
    offset.set(r ? 0 : withTiming(0, { duration: 300, easing: sheetEaseOut }));
  }, [visible, dim, offset]);

  // Exit is quicker than entry, and the list only unmounts once the sheet is gone.
  function close() {
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) {
        scheduleOnRN(onClose);
      }
    };
    if (reduced) {
      dim.set(withTiming(0, { duration: 150 }, done));
      return;
    }
    dim.set(withTiming(0, { duration: 200 }));
    offset.set(withTiming(height, { duration: 200, easing: sheetEaseOut }, done));
  }

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: reduced ? dim.get() : 1,
    transform: [{ translateY: offset.get() }],
  }));

  return (
    <Modal animationType="none" onRequestClose={close} transparent visible={visible}>
      <View style={styles.sheetHost}>
        {/* Tapping the dimmed map closes the list; screen readers use the Close button instead. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, dimStyle]}>
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {filter && onFilterChange ? (
            <EventFilters filter={filter} matching={shown.length} onChange={onFilterChange} total={events.length} />
          ) : null}
          <FlatList
            data={shown}
            keyExtractor={(event) => event.id}
            // The count line above already has the one Clear control.
            ListEmptyComponent={filtered ? (
              <Text accessibilityLiveRegion="polite" style={styles.rowMeta}>No events match these filters.</Text>
            ) : (
              <Text style={styles.rowMeta}>No events in this view</Text>
            )}
            renderItem={({ item }) => {
              const content = (
                <>
                  <Avatar event={item} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowMeta}>{item.host.displayName}</Text>
                  </View>
                </>
              );
              if (!onOpen) {
                return <View style={styles.row}>{content}</View>;
              }
              return (
                <Pressable
                  accessibilityHint="Opens event details"
                  accessibilityLabel={`${item.title}, hosted by ${item.host.displayName}`}
                  accessibilityRole="button"
                  onPress={() => onOpen(item.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  {content}
                </Pressable>
              );
            }}
          />
          <Pressable accessibilityLabel={closeLabel} accessibilityRole="button" onPress={close} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function MapUnavailable({ detail }: { detail: string }) {
  return (
    <View style={styles.unavailable}>
      <Text style={styles.title}>Map unavailable</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  unavailable: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: '#f4f4f2',
    gap: 8,
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: '#111',
    fontSize: 20,
    fontWeight: '700',
  },
  detail: {
    color: '#444',
    lineHeight: 20,
    maxWidth: 320,
    textAlign: 'center',
  },
  bubbles: {
    flexDirection: 'row',
  },
  avatar: {
    borderColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    height: 32,
    width: 32,
  },
  overlap: {
    marginLeft: -6,
  },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: '#111',
    borderColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  fallbackText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  ellipsis: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 2,
    height: 32,
    justifyContent: 'center',
    marginLeft: -6,
    width: 32,
  },
  ellipsisText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '700',
    marginTop: -6,
  },
  empty: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    elevation: 2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: 'absolute',
  },
  errorText: {
    color: '#8a1f1f',
  },
  sheetHost: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Figma 04/05: ink at 36%.
  scrim: {
    backgroundColor: 'rgba(30,26,29,0.36)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    padding: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#111',
    fontWeight: '600',
  },
  rowMeta: {
    color: '#666',
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 44,
  },
  closeText: {
    color: '#111',
    fontWeight: '600',
  },
});
