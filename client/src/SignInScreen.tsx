import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';

import ErrorIcon from '../assets/signin/error-icon.svg';
import GoogleLogo from '../assets/signin/google-logo.svg';
import PointerWhite from '../assets/signin/pin-pointer-white.svg';
import PointerYellow from '../assets/signin/pin-pointer-yellow.svg';
import YouAreHere from '../assets/signin/you-are-here.svg';
import { colors, easeOut, fonts } from './theme';

export type SignInError = { code: string; email: string | null };

type Props = {
  busy: boolean;
  error: SignInError | null;
  onSignIn: () => void;
};

// Figma "01 Sign in" and "02 Sign in: account rejected" (Android 360x800, iOS 393x852).
// Everything below the map is placed relative to the sign-in button, so the screen fits any height.
const layout = Platform.select({
  ios: {
    mapTop: -128,
    pins: [{ left: 20, top: 88 }, { left: 150, top: 162 }, { left: 40, top: 234 }],
    youAreHere: { left: 323, top: 132 },
    stageHeight: 448,
    wordmarkTop: 113,
    duck: { left: 0, top: 238, width: 190, height: 210 },
    tagline: { right: 5, top: 321, width: 190, fontSize: 21, lineHeight: 26 },
    bottomPadding: 47,
  },
  default: {
    mapTop: -150,
    pins: [{ left: 20, top: 66 }, { left: 128, top: 140 }, { left: 40, top: 212 }],
    youAreHere: { left: 290, top: 110 },
    stageHeight: 428,
    wordmarkTop: 106,
    duck: { left: -5, top: 235, width: 172, height: 190 },
    tagline: { right: 4, top: 301, width: 178, fontSize: 20, lineHeight: 25 },
    bottomPadding: 37,
  },
});

const samplePins = [
  { time: '7:30 PM', title: 'Studying for CS102!', initials: 'PS', avatar: '#3D5A80', highlight: false },
  { time: 'Now', title: 'Pickup soccer', initials: 'JK', avatar: '#2E7D5B', highlight: true },
  { time: '8:15 PM', title: 'Dumplings at the UCC', initials: 'DL', avatar: '#C2571A', highlight: false },
];

const restingCaption = 'Stevens accounts only (@stevens.edu)';

export default function SignInScreen({ busy, error, onSignIn }: Props) {
  // Keep the last error on screen while the card fades out.
  const [shown, setShown] = useState<SignInError>(error ?? { code: 'DOMAIN_NOT_ALLOWED', email: null });
  const [cardHeight, setCardHeight] = useState(0);
  const copy = errorCopy(shown);

  const entrance = useRef({
    map: new Animated.Value(0),
    pins: samplePins.map(() => new Animated.Value(0)),
    youAreHere: new Animated.Value(0),
    wordmark: new Animated.Value(0),
    tagline: new Animated.Value(0),
    duckRise: new Animated.Value(0),
    duckWave: new Animated.Value(0),
    signIn: new Animated.Value(0),
  }).current;
  const rejected = useRef(new Animated.Value(error ? 1 : 0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const iconPop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const all = [
      entrance.map,
      ...entrance.pins,
      entrance.youAreHere,
      entrance.wordmark,
      entrance.tagline,
      entrance.duckRise,
      entrance.duckWave,
      entrance.signIn,
    ];
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) {
        return;
      }
      if (reduced) {
        all.forEach((value) => value.setValue(1));
        return;
      }
      // Timings from the Figma motion spec, played once instead of looping.
      const fade = (value: Animated.Value, delay: number, duration: number) =>
        Animated.timing(value, { toValue: 1, delay, duration, easing: easeOut, useNativeDriver: true });
      const pop = (value: Animated.Value, delay: number) =>
        Animated.sequence([
          Animated.delay(delay),
          Animated.spring(value, { toValue: 1, stiffness: 260, damping: 18, useNativeDriver: true }),
        ]);
      Animated.parallel([
        fade(entrance.map, 0, 900),
        fade(entrance.wordmark, 100, 500),
        fade(entrance.signIn, 200, 400),
        fade(entrance.tagline, 220, 450),
        ...entrance.pins.map((pin, i) => pop(pin, 300 + i * 80)),
        fade(entrance.youAreHere, 600, 300),
        pop(entrance.duckRise, 450),
        Animated.timing(entrance.duckWave, { toValue: 1, delay: 1100, duration: 500, easing: Easing.linear, useNativeDriver: true }),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [entrance]);

  useEffect(() => {
    if (error) {
      setShown(error);
    }
    Animated.timing(rejected, { toValue: error ? 1 : 0, duration: 430, easing: easeOut, useNativeDriver: true }).start();
    if (!error) {
      return;
    }
    iconPop.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.delay(170),
        Animated.timing(shake, { toValue: -6, duration: 80, easing: easeOut, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 4, duration: 80, easing: easeOut, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 80, easing: easeOut, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(270),
        Animated.spring(iconPop, { toValue: 1, stiffness: 300, damping: 14, useNativeDriver: true }),
      ]),
    ]).start();
  }, [error, iconPop, rejected, shake]);

  const rise = (value: Animated.Value, distance: number) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
  });
  const fadeOutOnReject = (end: number) =>
    rejected.interpolate({ inputRange: [0, end], outputRange: [1, 0], extrapolate: 'clamp' });
  const slideUpOnReject = { transform: [{ translateY: rejected.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) }] };
  const label = busy ? 'Checking your account' : error ? copy.action : 'Continue with Google';

  return (
    <View style={styles.container}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={StyleSheet.absoluteFill}>
        <Animated.Image
          source={require('../assets/signin/campus-map.png')}
          style={[
            styles.map,
            { top: layout.mapTop },
            {
              opacity: entrance.map.interpolate({ inputRange: [0, 0.65, 1], outputRange: [0.4, 1, 1] }),
              transform: [{ scale: entrance.map.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }],
            },
          ]}
        />
        {samplePins.map((pin, i) => (
          <Animated.View
            key={pin.title}
            style={[
              styles.pin,
              layout.pins[i],
              {
                opacity: entrance.pins[i].interpolate({ inputRange: [0, 0.6], outputRange: [0, 1], extrapolate: 'clamp' }),
                transform: [
                  { translateY: entrance.pins[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                  { scale: entrance.pins[i].interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                ],
              },
            ]}
          >
            <View style={[styles.timeTag, pin.highlight && styles.timeTagHighlight]}>
              <View style={[styles.avatar, { backgroundColor: pin.avatar }]}>
                <Text allowFontScaling={false} style={styles.avatarText}>{pin.initials}</Text>
              </View>
              <Text allowFontScaling={false} style={styles.pinTime}>{pin.time}</Text>
              <Text allowFontScaling={false} style={styles.pinTitle}>{pin.title}</Text>
            </View>
            {pin.highlight ? <PointerYellow /> : <PointerWhite />}
          </Animated.View>
        ))}
        <Animated.View
          style={[
            styles.youAreHere,
            layout.youAreHere,
            {
              opacity: entrance.youAreHere,
              transform: [{ scale: entrance.youAreHere.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            },
          ]}
        >
          <YouAreHere />
        </Animated.View>
      </View>

      <View style={styles.bottom}>
        <View style={{ height: layout.stageHeight }}>
          <Animated.View style={[styles.fade, slideUpOnReject]}>
            <Svg height="100%" width="100%">
              <Defs>
                <LinearGradient id="fadeToRed" x1="0" x2="0" y1="0" y2="1">
                  <Stop offset="0" stopColor={colors.red} stopOpacity={0} />
                  <Stop offset="1" stopColor={colors.red} stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect fill="url(#fadeToRed)" height="100%" width="100%" />
            </Svg>
          </Animated.View>
          <Animated.View style={[styles.red, slideUpOnReject]} />
          <Animated.View
            style={[
              styles.wordmarkRow,
              { top: layout.wordmarkTop },
              rise(entrance.wordmark, 24),
            ]}
          >
            <Animated.Text
              accessibilityRole="header"
              allowFontScaling={false}
              style={[
                styles.wordmark,
                {
                  // Figma shrinks the wordmark from 96 to 84 on the rejected screen.
                  transform: [
                    { translateY: rejected.interpolate({ inputRange: [0, 1], outputRange: [0, -9] }) },
                    { scale: rejected.interpolate({ inputRange: [0, 1], outputRange: [1, 84 / 96] }) },
                  ],
                },
              ]}
            >
              Quack!
            </Animated.Text>
          </Animated.View>
          <Animated.View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[
              styles.duck,
              layout.duck,
              {
                opacity: fadeOutOnReject(0.55),
                transform: [
                  { translateY: entrance.duckRise.interpolate({ inputRange: [0, 1], outputRange: [layout.duck.height, 0] }) },
                  {
                    rotate: entrance.duckWave.interpolate({
                      inputRange: [0, 0.3, 0.6, 1],
                      outputRange: ['0deg', '-5deg', '4deg', '0deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            <Image source={require('../assets/signin/duck-waving.png')} style={styles.duckImage} />
          </Animated.View>
          <Animated.View
            style={[
              styles.tagline,
              { right: layout.tagline.right, top: layout.tagline.top, width: layout.tagline.width },
              rise(entrance.tagline, 16),
            ]}
          >
            <Animated.Text
              style={[
                styles.taglineText,
                { fontSize: layout.tagline.fontSize, lineHeight: layout.tagline.lineHeight },
                {
                  opacity: fadeOutOnReject(0.45),
                  transform: [{ translateY: rejected.interpolate({ inputRange: [0, 0.45], outputRange: [0, 8], extrapolate: 'clamp' }) }],
                },
              ]}
            >
              See what’s happening on campus, right now.
            </Animated.Text>
          </Animated.View>
        </View>

        <View style={[styles.signIn, { paddingBottom: layout.bottomPadding }]}>
          <Animated.View
            style={[
              styles.panel,
              {
                top: -(28 + cardHeight + 14),
                transform: [{ translateY: rejected.interpolate({ inputRange: [0, 1], outputRange: [cardHeight + 14, 0] }) }],
              },
            ]}
          />
          <Animated.View
            accessibilityElementsHidden={!error}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            importantForAccessibility={error ? 'yes' : 'no-hide-descendants'}
            onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
            style={[
              styles.card,
              { pointerEvents: 'none' },
              {
                opacity: rejected.interpolate({ inputRange: [0.4, 0.93], outputRange: [0, 1], extrapolate: 'clamp' }),
                transform: [{ translateY: rejected.interpolate({ inputRange: [0.4, 0.93], outputRange: [-10, 0], extrapolate: 'clamp' }) }],
              },
            ]}
          >
            <Animated.View style={{ transform: [{ scale: iconPop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}>
              <ErrorIcon />
            </Animated.View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{copy.title}</Text>
              <Text style={styles.cardBody}>{copy.body}</Text>
            </View>
          </Animated.View>
          <Animated.View style={[styles.controls, rise(entrance.signIn, 12)]}>
            <Animated.View style={{ transform: [{ translateX: shake }] }}>
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={onSignIn}
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              >
                <GoogleLogo />
                <Text style={styles.buttonText}>{label}</Text>
              </Pressable>
            </Animated.View>
            <View>
              <Animated.Text style={[styles.caption, { opacity: fadeOutOnReject(0.85) }]}>{restingCaption}</Animated.Text>
              <Animated.Text
                style={[
                  styles.caption,
                  styles.captionOverlay,
                  { opacity: rejected.interpolate({ inputRange: [0.67, 1], outputRange: [0, 1], extrapolate: 'clamp' }) },
                ]}
              >
                {copy.caption}
              </Animated.Text>
            </View>
          </Animated.View>
        </View>
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

function errorCopy(error: SignInError) {
  switch (error.code) {
    case 'DOMAIN_NOT_ALLOWED':
      return {
        title: 'That isn’t a Stevens account',
        body: error.email
          ? `You signed in as ${error.email}. Quack! is only for @stevens.edu Google accounts.`
          : 'Quack! is only for @stevens.edu Google accounts.',
        action: 'Use a Stevens account',
        caption: 'You’ll choose a Google account next',
      };
    case 'EMAIL_NOT_VERIFIED':
      return {
        title: 'That Google email isn’t verified',
        body: 'Verify it in your Google account, then try again.',
        action: 'Try again',
        caption: restingCaption,
      };
    case 'SEED_ACCOUNT':
      return {
        title: 'This account can’t sign in',
        body: 'It’s reserved for Quack! demo data. Use your own Stevens account.',
        action: 'Use a Stevens account',
        caption: 'You’ll choose a Google account next',
      };
    default:
      return {
        title: 'Sign-in didn’t finish',
        body: 'Something went wrong. Try again.',
        action: 'Try again',
        caption: restingCaption,
      };
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.red,
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    height: 825,
    left: -150,
    position: 'absolute',
    resizeMode: 'cover',
    width: 751,
  },
  pin: {
    alignItems: 'center',
    position: 'absolute',
  },
  timeTag: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    boxShadow: '0px 3px 10px 0px rgba(31, 15, 20, 0.22)',
    flexDirection: 'row',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 14,
    paddingVertical: 4,
  },
  timeTagHighlight: {
    backgroundColor: colors.yellow,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  avatarText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  pinTime: {
    color: colors.ink,
    fontFamily: fonts.displayBold,
    fontSize: 13,
  },
  pinTitle: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '500',
  },
  youAreHere: {
    position: 'absolute',
  },
  bottom: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  fade: {
    height: 140,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  red: {
    backgroundColor: colors.red,
    height: 1200,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 139,
  },
  wordmarkRow: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  wordmark: {
    color: colors.cream,
    fontFamily: fonts.displayExtraBold,
    fontSize: 96,
    includeFontPadding: false,
    letterSpacing: -3.84,
    lineHeight: 96,
  },
  duck: {
    position: 'absolute',
  },
  duckImage: {
    height: '100%',
    resizeMode: 'cover',
    width: '100%',
  },
  tagline: {
    position: 'absolute',
  },
  taglineText: {
    color: colors.cream,
    fontFamily: fonts.displaySemiBold,
    letterSpacing: -0.2,
  },
  signIn: {
    paddingHorizontal: 24,
  },
  controls: {
    gap: 14,
  },
  panel: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  card: {
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    borderColor: colors.errorLine,
    borderRadius: 16,
    borderWidth: 1,
    bottom: '100%',
    flexDirection: 'row',
    gap: 12,
    left: 24,
    marginBottom: 14,
    padding: 16,
    position: 'absolute',
    right: 24,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  cardBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: '0px 1px 3px 0px rgba(31, 15, 20, 0.08)',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 56,
    paddingVertical: 16,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  buttonText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '500',
  },
  caption: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  captionOverlay: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
