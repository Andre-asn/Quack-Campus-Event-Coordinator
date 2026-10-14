import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { restoreSession, signInWithGoogle, signOut } from './src/auth';
import type { StoredSession } from './src/sessionStore';

type Screen =
  | { status: 'loading' }
  | { status: 'signed-out'; message: string | null; busy: boolean }
  | { status: 'signed-in'; session: StoredSession; message: string | null; busy: boolean };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((session) => {
        if (cancelled) {
          return;
        }
        setScreen(session
          ? { status: 'signed-in', session, message: null, busy: false }
          : { status: 'signed-out', message: null, busy: false });
      })
      .catch(() => {
        if (!cancelled) {
          setScreen({ status: 'signed-out', message: null, busy: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSignIn() {
    setScreen({ status: 'signed-out', message: null, busy: true });
    try {
      const result = await signInWithGoogle();
      if (result.type === 'success') {
        setScreen({ status: 'signed-in', session: result.session, message: null, busy: false });
        return;
      }
      setScreen({
        status: 'signed-out',
        message: result.type === 'error' ? messageFor(result.code) : null,
        busy: false,
      });
    } catch {
      setScreen({ status: 'signed-out', message: 'Sign-in failed. Try again.', busy: false });
    }
  }

  async function onSignOut() {
    if (screen.status !== 'signed-in') {
      return;
    }
    setScreen({ ...screen, busy: true, message: null });
    const outcome = await signOut(screen.session.sessionId);
    if (outcome === 'signed-out') {
      setScreen({ status: 'signed-out', message: null, busy: false });
      return;
    }
    setScreen({ ...screen, busy: false, message: 'Could not sign out. Try again.' });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quack!</Text>
      {screen.status === 'loading' ? <Text style={styles.body}>Restoring session...</Text> : null}
      {screen.status === 'signed-out' ? (
        <>
          <Text style={styles.body}>Sign in with your Stevens Google account.</Text>
          {screen.message ? <Text style={styles.error}>{screen.message}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in with Stevens Google"
            accessibilityState={{ disabled: screen.busy }}
            disabled={screen.busy}
            onPress={() => void onSignIn()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{screen.busy ? 'Signing in...' : 'Sign in with Stevens Google'}</Text>
          </Pressable>
        </>
      ) : null}
      {screen.status === 'signed-in' ? (
        <>
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
        </>
      ) : null}
      <StatusBar style="auto" />
    </View>
  );
}

function messageFor(code: string): string {
  switch (code) {
    case 'DOMAIN_NOT_ALLOWED':
      return 'Use a Stevens Google account to sign in.';
    case 'EMAIL_NOT_VERIFIED':
      return "That Google account's email is not verified.";
    case 'SEED_ACCOUNT':
      return 'This account cannot sign in.';
    default:
      return 'Sign-in failed. Try again.';
  }
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
