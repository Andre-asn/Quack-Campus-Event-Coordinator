import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox, { Camera, CircleLayer, MapView, MarkerView, StyleImport, VectorSource } from '@rnmapbox/maps';
import type { Position } from 'geojson';
import { StatusBar } from 'expo-status-bar';

import { mapboxAccessToken, stevensCenter } from './config';
import { campusDayKey } from './campusTime';
import { groupBySpot, loadMapEvents, type MapEvent, type Spot } from './mapEvents';

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

export default function CampusMap({ sessionId, refreshKey = 0, bottomInset = 0, onPinMoved }: Props) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  // Lookups can finish out of order; only the newest may move the pin.
  const latestLookup = useRef(0);
  const [failed, setFailed] = useState(false);
  const [lightPreset, setLightPreset] = useState(() => lightPresetFor(new Date().getHours()));
  const [day, setDay] = useState(() => campusDayKey(new Date()));
  const [bbox, setBbox] = useState<string | null>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showAll, setShowAll] = useState<Spot | null>(null);
  const [viewList, setViewList] = useState(false);
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
    let cancelled = false;
    setEvents([]);
    setLoaded(false);
    setLoadError(false);
    setShowAll(null);
    setViewList(false);
    void loadMapEvents(sessionId, bbox)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setEvents(result.events);
        setLoaded(true);
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
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
            <SpotBubble spot={spot} onShowAll={() => setShowAll(spot)} />
          </MarkerView>
        ))}
      </MapView>
      {loaded && !loadError && events.length === 0 ? (
        <View pointerEvents="none" style={styles.empty}>
          <Text style={styles.emptyText}>No events in this view</Text>
        </View>
      ) : null}
      {loadError ? (
        <View pointerEvents="none" style={styles.empty}>
          <Text style={styles.errorText}>Couldn't load events. Pan the map to try again.</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityLabel="Events in this view"
        accessibilityRole="button"
        onPress={() => setViewList(true)}
        style={[styles.listButton, { bottom: Math.max(insets.bottom, bottomInset) + 16 }]}
      >
        <Text style={styles.listButtonText}>Events in this view</Text>
      </Pressable>
      <EventList
        closeLabel="Close show all"
        events={showAll?.events ?? []}
        onClose={() => setShowAll(null)}
        title="Show all"
        visible={showAll !== null}
      />
      <EventList
        closeLabel="Close events in this view"
        events={events}
        onClose={() => setViewList(false)}
        title="Events in this view"
        visible={viewList}
      />
      <StatusBar style={lightPreset === 'dusk' || lightPreset === 'night' ? 'light' : 'dark'} />
    </>
  );
}

function SpotBubble({ spot, onShowAll }: { spot: Spot; onShowAll: () => void }) {
  const visible = spot.events.slice(0, 3);
  const overflow = spot.events.length > 3;
  return (
    <View style={styles.bubbles}>
      {visible.map((event, index) => (
        <Pressable
          accessibilityLabel={event.title}
          accessibilityRole="button"
          key={event.id}
          onPress={onShowAll}
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
}: {
  title: string;
  events: MapEvent[];
  visible: boolean;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <FlatList
            data={events}
            keyExtractor={(event) => event.id}
            ListEmptyComponent={<Text style={styles.rowMeta}>No events in this view</Text>}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Avatar event={item} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowMeta}>{item.host.displayName}</Text>
                </View>
              </View>
            )}
          />
          <Pressable accessibilityLabel={closeLabel} accessibilityRole="button" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
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
  listButton: {
    backgroundColor: '#fff',
    borderRadius: 999,
    elevation: 3,
    justifyContent: 'center',
    left: 16,
    minHeight: 44,
    paddingHorizontal: 16,
    position: 'absolute',
  },
  listButtonText: {
    color: '#111',
    fontWeight: '600',
  },
  empty: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    elevation: 2,
    marginTop: 72,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyText: {
    color: '#444',
  },
  errorText: {
    color: '#8a1f1f',
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    flex: 1,
    justifyContent: 'flex-end',
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
