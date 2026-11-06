import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ShowListIcon from '../assets/map/show-list.svg';
import type { CurrentUser } from './sessionStore';
import { colors } from './theme';

export const TOP_BAR_HEIGHT = 56;
export const TOP_BAR_GAP = 8;

export type Account = {
  user: CurrentUser;
  busy: boolean;
  // Shown under the bar, e.g. a failed sign out.
  message: string | null;
  onSignOut: () => void;
};

type Props = {
  account: Account;
  // null until the first map query answers, so the bar never flashes "0 events".
  count: number | null;
  onOpenList: () => void;
};

// Figma 03: logo, today's count for this view, the list, and the signed-in user.
export default function TopBar({ account, count, onOpenList }: Props) {
  const insets = useSafeAreaInsets();
  const { user, busy, message, onSignOut } = account;
  const summary = count === null ? 'Finding events…' : `${count} ${count === 1 ? 'event' : 'events'} today`;

  function confirmSignOut() {
    Alert.alert(user.displayName, user.email, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
    ]);
  }

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + TOP_BAR_GAP }]}>
      <View style={styles.bar}>
        <Image accessibilityIgnoresInvertColors source={require('../assets/signin/duck-badge.png')} style={styles.logo} />
        <Text accessibilityRole="header" numberOfLines={1} style={styles.summary}>
          {summary}
        </Text>
        <Pressable
          accessibilityLabel="Events in this view"
          accessibilityRole="button"
          onPress={onOpenList}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <ShowListIcon height={24} width={24} />
        </Pressable>
        <Pressable
          accessibilityHint="Shows your account and Sign out"
          accessibilityLabel={busy ? 'Signing out' : `Account, ${user.email}`}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          // The avatar is 36pt; the slop makes the target 44pt.
          hitSlop={4}
          onPress={confirmSignOut}
          style={({ pressed }) => [pressed && styles.pressed, busy && styles.busy]}
        >
          <UserAvatar user={user} />
        </Pressable>
      </View>
      {message ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function UserAvatar({ user }: { user: CurrentUser }) {
  if (user.avatarUrl) {
    return <Image accessibilityIgnoresInvertColors source={{ uri: user.avatarUrl }} style={styles.avatar} />;
  }
  const initials = user.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    gap: 6,
    left: 16,
    position: 'absolute',
    right: 16,
  },
  bar: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.white,
    borderRadius: 28,
    elevation: 4,
    flexDirection: 'row',
    gap: 4,
    height: TOP_BAR_HEIGHT,
    paddingLeft: 10,
    paddingRight: 6,
    shadowColor: '#1F0F14',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  logo: {
    height: 32,
    width: 40,
  },
  summary: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatar: {
    borderRadius: 18,
    height: 36,
    width: 36,
  },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  busy: {
    opacity: 0.5,
  },
  message: {
    backgroundColor: colors.white,
    borderRadius: 8,
    color: colors.red,
    elevation: 3,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
