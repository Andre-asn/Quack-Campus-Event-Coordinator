import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import LoadingDot from '../assets/signin/loading-dot.svg';
import { colors, easeOut } from './theme';

// Figma "09 Loading": the duck badge grows in, then three dots bounce in turn.
export default function LoadingScreen() {
  const badge = useRef(new Animated.Value(0)).current;
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) {
        return;
      }
      if (reduced) {
        badge.setValue(1);
        dots.forEach((dot) => dot.setValue(1));
        return;
      }
      Animated.timing(badge, { toValue: 1, duration: 650, delay: 100, easing: easeOut, useNativeDriver: true }).start();
      const bounce = (dot: Animated.Value, delay: number) =>
        Animated.sequence([
          Animated.delay(delay),
          Animated.loop(
            Animated.sequence([
              Animated.timing(dot, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
              Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ]),
          ),
        ]);
      loop = Animated.parallel(dots.map((dot, i) => bounce(dot, 500 + i * 150)));
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [badge, dots]);

  return (
    <View accessibilityLabel="Loading Quack!" accessibilityRole="progressbar" style={styles.container}>
      <Animated.View
        style={[
          styles.badge,
          {
            opacity: badge.interpolate({ inputRange: [0, 0.1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [6 / 168, 1] }) }],
          },
        ]}
      >
        <Image accessibilityIgnoresInvertColors source={require('../assets/signin/duck-badge.png')} style={styles.duck} />
      </Animated.View>
      <View style={styles.dots}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={{
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
            }}
          >
            <LoadingDot />
          </Animated.View>
        ))}
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.red,
    flex: 1,
    gap: 32,
    justifyContent: 'center',
    // The Figma badge sits 20px above center.
    paddingBottom: 40,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: 84,
    height: 168,
    overflow: 'hidden',
    width: 168,
  },
  duck: {
    height: 138,
    // Centered in the 168px badge, then 15px lower, as in Figma.
    marginTop: (168 - 138) / 2 + 15,
    resizeMode: 'cover',
    width: 162,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
});
