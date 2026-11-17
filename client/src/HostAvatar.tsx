import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from './theme';

// The avatar colours from the Figma redesign (frames 03-05).
const palette = ['#3D5A80', '#2E7D5B', '#C2571A', '#7A4E9B', '#4A6B8A', '#8C6D1F', '#A32638'];

// The same host always gets the same colour. Map events don't carry the host's id, so the
// display name is the stable key.
export function avatarColor(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return palette[hash % palette.length];
}

// "Priya Shah" -> "PS", "ada" -> "A".
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

type Props = {
  host: { displayName: string; avatarUrl: string | null };
  size: number;
  // A white ring, for avatars that overlap on the map.
  ringed?: boolean;
  style?: StyleProp<ViewStyle>;
};

// A host's photo, or their initials on their colour. Decorative: the surrounding control
// carries the accessibility label.
export default function HostAvatar({ host, size, ringed = false, style }: Props) {
  const shape = { borderRadius: size / 2, height: size, width: size };
  const ring = ringed ? styles.ring : null;
  if (host.avatarUrl) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: host.avatarUrl }}
        style={[shape, ring, style as never]}
      />
    );
  }
  return (
    <View style={[styles.fallback, shape, ring, { backgroundColor: avatarColor(host.displayName) }, style]}>
      {/* Figma sizes: 24 -> 9, 28 -> 11, 40 -> 15. */}
      <Text style={[styles.text, { fontSize: Math.round(size * 0.38) }]}>{initials(host.displayName)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderColor: colors.white,
    borderWidth: 2,
  },
  text: {
    color: colors.white,
    fontWeight: '700',
  },
});
