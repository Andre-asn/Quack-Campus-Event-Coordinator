import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';

import AddIcon from './assets/create/add.svg';
import CampusMap, { type PinnedPlace } from './src/CampusMap';
import CreateEventSheet from './src/CreateEventSheet';
import LoadingScreen from './src/LoadingScreen';
import SignInScreen, { type SignInError } from './src/SignInScreen';
import { restoreSession, signInWithGoogle, signOut } from './src/auth';
import type { StoredSession } from './src/sessionStore';
import { colors } from './src/theme';

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
  const [creating, setCreating] = useState(false);
  const [sheetInset, setSheetInset] = useState(0);
  const [pinned, setPinned] = useState<PinnedPlace | null>(null);
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

  function closeCreate() {
    setCreating(false);
    setSheetInset(0);
    setPinned(null);
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
      <CampusMap bottomInset={sheetInset} onPinMoved={creating ? setPinned : undefined} />
      {creating ? (
        <CreateEventSheet
          onClose={closeCreate}
          onInset={setSheetInset}
          onPosted={closeCreate}
          place={pinned}
          sessionId={screen.session.sessionId}
        />
      ) : (
        <Pressable
          accessibilityLabel="Pin an event"
          accessibilityRole="button"
          onPress={() => setCreating(true)}
          style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 16 }, pressed && styles.pressed]}
        >
          <AddIcon height={24} width={24} />
          <Text style={styles.fabText}>Pin an event</Text>
        </Pressable>
      )}
      {/* Clears the status bar, notch, or Dynamic Island while the map stays full-screen. */}
      <View pointerEvents="box-none" style={[styles.overlay, creating && styles.hidden, { paddingTop: insets.top + 12 }]}>
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
  hidden: {
    display: 'none',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.red,
    borderRadius: 16,
    elevation: 6,
    flexDirection: 'row',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 20,
    paddingVertical: 16,
    position: 'absolute',
    right: 16,
    shadowColor: '#1F0F14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
  fabText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
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
