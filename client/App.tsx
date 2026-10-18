import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';

import LoadingScreen from './src/LoadingScreen';
import SignInScreen, { type SignInError } from './src/SignInScreen';
import { restoreSession, signInWithGoogle, signOut } from './src/auth';
import type { StoredSession } from './src/sessionStore';

type Screen =
  | { status: 'loading' }
  | { status: 'signed-out'; error: SignInError | null; busy: boolean }
  | { status: 'signed-in'; session: StoredSession; message: string | null; busy: boolean };

export default function App() {
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
    <View style={styles.container}>
      <Text style={styles.title}>Quack!</Text>
      <Text style={styles.body}>Signed in as {screen.session.user.displayName}</Text>
      <Text style={styles.email}>{screen.session.user.email}</Text>
      {screen.message ? <Text style={styles.error}>{screen.message}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        accessibilityState={{ disabled: screen.busy }}
        disabled={screen.busy}
        onPress={() => void onSignOut()}
        style={styles.button}
      >
        <Text style={styles.buttonText}>{screen.busy ? 'Signing out...' : 'Sign out'}</Text>
      </Pressable>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    gap: 8,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  body: {
    color: '#444',
    textAlign: 'center',
  },
  email: {
    color: '#666',
  },
  error: {
    color: '#8a1f1f',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
