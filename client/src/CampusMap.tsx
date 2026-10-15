import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { Camera, MapView } from '@rnmapbox/maps';

import { mapboxAccessToken, stevensCenter } from './config';

if (mapboxAccessToken) {
  void Mapbox.setAccessToken(mapboxAccessToken);
  // CLAUDE.md: no analytics or third-party tracking.
  Mapbox.setTelemetryEnabled(false);
}

export default function CampusMap() {
  const [failed, setFailed] = useState(false);

  if (!mapboxAccessToken) {
    return (
      <MapUnavailable detail="No Mapbox token is configured. Set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to a public pk. token in client/.env, then restart the bundler." />
    );
  }
  if (failed) {
    return <MapUnavailable detail="The map could not load. Check your connection and reopen Quack!." />;
  }
  return (
    <MapView
      accessibilityLabel="Map of the Stevens campus"
      onDidFailLoadingMap={() => setFailed(true)}
      scaleBarEnabled={false}
      style={StyleSheet.absoluteFill}
    >
      <Camera defaultSettings={{ centerCoordinate: stevensCenter, zoomLevel: 15.5 }} />
    </MapView>
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
