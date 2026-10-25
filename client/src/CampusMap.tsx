import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { Camera, CircleLayer, MapView, StyleImport, VectorSource } from '@rnmapbox/maps';
import type { Position } from 'geojson';
import { StatusBar } from 'expo-status-bar';

import { mapboxAccessToken, stevensCenter } from './config';

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

export default function CampusMap({ bottomInset = 0, onPinMoved }: Props) {
  const mapRef = useRef<MapView>(null);
  // Lookups can finish out of order; only the newest may move the pin.
  const latestLookup = useRef(0);
  const [failed, setFailed] = useState(false);
  const [lightPreset, setLightPreset] = useState(() => lightPresetFor(new Date().getHours()));

  // Keep the lighting in step with the clock while the app stays open.
  useEffect(() => {
    const timer = setInterval(() => setLightPreset(lightPresetFor(new Date().getHours())), 60_000);
    return () => clearInterval(timer);
  }, []);

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
        onMapIdle={onPinMoved && ((state) => {
          const lookup = ++latestLookup.current;
          void placeAt(mapRef.current, state.properties.center).then((place) => {
            if (lookup === latestLookup.current) {
              onPinMoved(place);
            }
          });
        })}
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
      </MapView>
      <StatusBar style={lightPreset === 'dusk' || lightPreset === 'night' ? 'light' : 'dark'} />
    </>
  );
}

function MapUnavailable({ detail }: { detail: string }) {
  return (
    <View accessibilityRole="alert" style={styles.unavailable}>
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
});
