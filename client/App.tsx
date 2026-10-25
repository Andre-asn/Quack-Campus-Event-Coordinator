import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';

import CampusMap from './src/CampusMap';
import LoadingScreen from './src/LoadingScreen';
import SignInScreen, { type SignInError } from './src/SignInScreen';
import { restoreSession, signInWithGoogle, signOut } from './src/auth';
import type { StoredSession } from './src/sessionStore';

type Screen =
  | { status: 'loading' }
  | { status: 'signed-out'; error: SignInError | null; busy: boolean }
  | { status: 'signed-in'; session: StoredSession; message: string | null; busy: boolean };

export default function App() {
  return (
    <SafeAreaProvider>
      <QuackApp />
    </SafeAreaProvider>
  );
}

function QuackApp() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>({ status: 'loading' });
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((session) => {
        if (cancelled) {
          return;
        }
        setScreen(session
          ? { status: 'signed-in', session, message: null, busy: false }
          : { status: 'signed-out', error: null, busy: false });
      })
      .catch(() => {
        if (!cancelled) {
          setScreen({ status: 'signed-out', error: null, busy: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSignIn() {
    // Keep the last error on screen while the browser is open.
    const previous = screen.status === 'signed-out' ? screen.error : null;
    setScreen({ status: 'signed-out', error: previous, busy: true });
    try {
      const result = await signInWithGoogle();
      if (result.type === 'success') {
        setScreen({ status: 'signed-in', session: result.session, message: null, busy: false });
        return;
      }
      setScreen({
        status: 'signed-out',
        error: result.type === 'error' ? { code: result.code, email: result.email ?? null } : previous,
        busy: false,
      });
    } catch {
      setScreen({ status: 'signed-out', error: { code: 'SIGN_IN_FAILED', email: null }, busy: false });
    }
  }

  async function onSignOut() {
    if (screen.status !== 'signed-in') {
      return;
    }
    setScreen({ ...screen, busy: true, message: null });
    const outcome = await signOut(screen.session.sessionId);
    if (outcome === 'signed-out') {
      setScreen({ status: 'signed-out', error: null, busy: false });
      return;
    }
    setScreen({ ...screen, busy: false, message: 'Could not sign out. Try again.' });
  }

  // A font that fails to load falls back to the system font rather than blocking sign-in.
  if (screen.status === 'loading' || (!fontsLoaded && !fontError)) {
    return <LoadingScreen />;
  }

  if (screen.status === 'signed-out') {
    return <SignInScreen busy={screen.busy} error={screen.error} onSignIn={() => void onSignIn()} />;
  }

  return (
    <View style={styles.home}>
      <CampusMap sessionId={screen.session.sessionId} />
      {/* Clears the status bar, notch, or Dynamic Island while the map stays full-screen. */}
      <View pointerEvents="box-none" style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sign out ${screen.session.user.email}`}
          accessibilityState={{ disabled: screen.busy }}
          disabled={screen.busy}
          onPress={() => void onSignOut()}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <Text style={styles.chipText}>{screen.busy ? 'Signing out...' : 'Sign out'}</Text>
        </Pressable>
        {screen.message ? <Text style={styles.chipError}>{screen.message}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  home: {
    flex: 1,
  },
  overlay: {
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: 16,
  },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    elevation: 3,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  chipText: {
    color: '#111',
    fontWeight: '600',
  },
  chipError: {
    backgroundColor: '#fff',
    borderRadius: 8,
    color: '#8a1f1f',
    elevation: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
