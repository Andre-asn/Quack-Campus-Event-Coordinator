import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { Camera, MapView, StyleImport } from '@rnmapbox/maps';
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

export default function CampusMap() {
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
        accessibilityLabel="Map of the Stevens campus"
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
        {/* Tilted so the 3D buildings read as 3D. */}
        <Camera defaultSettings={{ centerCoordinate: stevensCenter, pitch: 45, zoomLevel: 16 }} />
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
