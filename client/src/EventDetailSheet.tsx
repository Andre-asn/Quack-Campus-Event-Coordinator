import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import ClockIcon from '../assets/detail/clock.svg';
import PeopleIcon from '../assets/detail/people.svg';
import PlaceIcon from '../assets/detail/place.svg';
import CloseIcon from '../assets/create/close.svg';
import { categories, categoryLabel } from './categories';
import { cancelEvent, loadEventDetail, setAttendance, updateEvent, type EventDetail } from './eventDetail';
import { eventShareLink, type FieldErrors } from './events';
import HostAvatar from './HostAvatar';
// Reanimated's withTiming needs the worklet easing, not core Animated's easeOut.
import { colors, fonts, sheetEaseOut as easeOut } from './theme';
import { formatWhen, relativeStart } from './when';

type Props = {
  sessionId: string;
  eventId: string;
  token?: string | null;
  onClose: () => void;
  onChanged?: () => void;
};

// The server rejects a start past exactly 48 hours, so stop 5 minutes short of the phone clock.
const MAX_AHEAD_MS = (48 * 60 - 5) * 60 * 1000;

function clampStart(date: Date): Date {
  const now = Date.now();
  return new Date(Math.min(Math.max(date.getTime(), now), now + MAX_AHEAD_MS));
}

function pickStartOnAndroid(current: Date, onPick: (date: Date) => void) {
  DateTimePickerAndroid.open({
    value: current,
    mode: 'date',
    minimumDate: new Date(),
    maximumDate: new Date(Date.now() + MAX_AHEAD_MS),
    onValueChange: (_, date) => {
      if (!date) {
        return;
      }
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        onValueChange: (__, time) => {
          if (time) {
            onPick(clampStart(time));
          }
        },
      });
    },
  });
}

type State =
  | { status: 'loading' }
  | { status: 'loaded'; event: EventDetail }
  | { status: 'failed'; message: string; retry: boolean };

// Frame 06 "Event detail: not joined" in the Quack! Figma redesign. The map stays mounted under the
// sheet and its camera is never touched, so dismissing returns to the same view.
export default function EventDetailSheet({ sessionId, eventId, token, onClose, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<'join' | 'leave' | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const attendanceRequest = useRef(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const offset = useSharedValue(reduced ? 0 : windowHeight);
  const opacity = useSharedValue(reduced ? 0 : 1);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      opacity.set(withTiming(1, { duration: 200 }));
    } else {
      offset.set(withSpring(0, { duration: 300, dampingRatio: 1 }));
    }
    // Runs once on open.
  }, []);

  // Fetched each time the sheet opens, so counts and cancellations are current.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    attendanceRequest.current += 1;
    setState({ status: 'loading' });
    setPending(false);
    setPendingAction(null);
    setNeedsRefresh(false);
    setActionError(null);
    loadEventDetail(sessionId, eventId, controller.signal, token)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setState(result.ok
          ? { status: 'loaded', event: result.event }
          : { status: 'failed', message: result.message, retry: result.retry });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'failed', message: 'Couldn’t reach Quack!. Check your connection.', retry: true });
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionId, eventId, token, attempt]);

  async function changeAttendance(event: EventDetail) {
    if (pending) {
      return;
    }
    const requestId = attendanceRequest.current + 1;
    attendanceRequest.current = requestId;
    const joining = !event.joined;
    const previous = event;
    setPending(true);
    setPendingAction(joining ? 'join' : 'leave');
    setNeedsRefresh(false);
    setActionError(null);
    setState({
      status: 'loaded',
      event: {
        ...event,
        joined: joining,
        attendeeCount: Math.max(0, event.attendeeCount + (joining ? 1 : -1)),
      },
    });
    let outcome: { ok: true } | { ok: false; message: string };
    try {
      outcome = await setAttendance(sessionId, eventId, joining, token ?? event.shareToken);
    } catch {
      outcome = { ok: false, message: 'Couldn’t reach Quack!. Check your connection.' };
    }
    if (requestId !== attendanceRequest.current) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let refreshed: Awaited<ReturnType<typeof loadEventDetail>> | null = null;
    try {
      refreshed = await loadEventDetail(sessionId, eventId, controller.signal, token);
    } catch {
      refreshed = null;
    } finally {
      clearTimeout(timer);
    }
    if (requestId !== attendanceRequest.current) {
      return;
    }
    setPending(false);
    setPendingAction(null);
    if (refreshed?.ok) {
      setNeedsRefresh(false);
      setState({ status: 'loaded', event: refreshed.event });
      if (!outcome.ok && refreshed.event.joined !== joining) {
        setActionError(outcome.message);
      }
      return;
    }
    if (outcome.ok) {
      setNeedsRefresh(true);
      setActionError('Couldn’t refresh this event. Try again.');
      return;
    }
    setNeedsRefresh(false);
    setState({ status: 'loaded', event: previous });
    setActionError(outcome.message);
  }

  // Keeps "Starts in 25 min" honest while the sheet stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Exit is quicker than entry.
  const close = useCallback(() => {
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) {
        scheduleOnRN(onClose);
      }
    };
    if (reduced) {
      opacity.set(withTiming(0, { duration: 150 }, done));
    } else {
      offset.set(withTiming(windowHeight, { duration: 200, easing: easeOut }, done));
    }
  }, [offset, opacity, onClose, reduced, windowHeight]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close]);

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(10)
        .onStart(() => {
          dragStart.set(offset.get());
        })
        .onUpdate((event) => {
          // Follows the finger down; resists going up past open.
          const next = dragStart.get() + event.translationY;
          offset.set(next < 0 ? next / 4 : next);
        })
        .onEnd((event) => {
          if (offset.get() > 120 || event.velocityY > 800) {
            scheduleOnRN(close);
          } else {
            offset.set(withSpring(0, { duration: 300, dampingRatio: 0.8, velocity: event.velocityY }));
          }
        }),
    [close, dragStart, offset],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: offset.get() }],
  }));

  return (
    <Animated.View
      accessibilityViewIsModal
      style={[styles.sheet, { maxHeight: windowHeight * 0.85, paddingBottom: insets.bottom + 24 }, sheetStyle]}
    >
      <GestureDetector gesture={drag}>
        <View style={styles.handleArea}>
          <Pressable
            accessibilityLabel="Close event details"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }}
            onPress={close}
            style={styles.handleTarget}
          >
            <View style={styles.handle} />
          </Pressable>
        </View>
      </GestureDetector>

      {state.status === 'loaded' ? (
        <Details
          actionError={actionError}
          event={state.event}
          now={now}
          onAttendance={() => void changeAttendance(state.event)}
          onRetry={needsRefresh ? () => setAttempt((value) => value + 1) : undefined}
          onSaved={() => {
            setAttempt((value) => value + 1);
            onChanged?.();
          }}
          pending={pending}
          pendingAction={pendingAction}
          sessionId={sessionId}
        />
      ) : state.status === 'loading' ? (
        <View accessibilityLabel="Loading event" style={styles.placeholder}>
          <ActivityIndicator color={colors.red} />
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.failure}>
            {state.message}
          </Text>
          {state.retry ? (
            <Pressable
              accessibilityLabel="Try loading the event again"
              accessibilityRole="button"
              onPress={() => setAttempt((value) => value + 1)}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        hitSlop={4}
        onPress={close}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        <CloseIcon height={20} width={20} />
      </Pressable>
    </Animated.View>
  );
}

function attendanceLabel(joined: boolean, pendingAction: 'join' | 'leave' | null): string {
  if (pendingAction === 'join') {
    return 'Joining...';
  }
  if (pendingAction === 'leave') {
    return 'Leaving...';
  }
  return joined ? 'Leave' : 'Join';
}

function Details({
  event,
  now,
  pending,
  pendingAction,
  actionError,
  onAttendance,
  onRetry,
  sessionId,
  onSaved,
}: {
  event: EventDetail;
  now: Date;
  pending: boolean;
  pendingAction: 'join' | 'leave' | null;
  actionError: string | null;
  onAttendance: () => void;
  onRetry?: () => void;
  sessionId: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [category, setCategory] = useState(event.category);
  const [locationLabel, setLocationLabel] = useState(event.locationLabel);
  const [startsAtDraft, setStartsAtDraft] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (editing) {
      return;
    }
    setTitle(event.title);
    setDescription(event.description);
    setCategory(event.category);
    setLocationLabel(event.locationLabel);
    setStartsAtDraft(null);
    setEditError(null);
    setFieldErrors({});
  }, [event, editing]);

  const startsAt = startsAtDraft ?? new Date(event.startsAt);
  const cancelled = event.status === 'cancelled';
  const relative = relativeStart(new Date(event.startsAt), now);
  const meta = relative === 'now'
    ? 'Starting now'
    : relative.startsWith('in ')
      ? `Starts ${relative}`
      : `Started ${relative}`;
  const categoryName = categoryLabel(event.category);
  const canHost = event.hosting && event.status === 'active';

  async function save() {
    if (saving) {
      return;
    }
    setSaving(true);
    setEditError(null);
    const outcome = await updateEvent(sessionId, event.id, {
      title: title.trim(),
      description: description.trim(),
      category,
      latitude: event.latitude,
      longitude: event.longitude,
      locationLabel: locationLabel.trim(),
      startsAt: startsAtDraft ? startsAtDraft.toISOString() : event.startsAt,
    });
    setSaving(false);
    if (!outcome.ok) {
      setFieldErrors(outcome.fieldErrors);
      setEditError(outcome.message);
      return;
    }
    onSaved();
  }

  function confirmCancel() {
    Alert.alert(
      'Cancel this event?',
      'It stays on this sheet as cancelled and leaves the map.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel event',
          style: 'destructive',
          onPress: () => void runCancel(),
        },
      ],
    );
  }

  async function runCancel() {
    if (saving) {
      return;
    }
    setSaving(true);
    setEditError(null);
    const outcome = await cancelEvent(sessionId, event.id);
    setSaving(false);
    if (!outcome.ok) {
      setEditError(outcome.message);
      return;
    }
    onSaved();
  }

  return (
    <ScrollView bounces={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.meta}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{editing ? categoryLabel(category) : categoryName}</Text>
          </View>
          {cancelled ? (
            <View accessibilityLabel="This event was cancelled" style={styles.cancelledChip}>
              <Text style={styles.cancelledText}>Cancelled</Text>
            </View>
          ) : (
            <Text style={styles.metaText}>{meta}</Text>
          )}
        </View>
        {editing ? (
          <Text accessibilityRole="header" style={styles.title}>Edit event</Text>
        ) : (
          <Text accessibilityRole="header" style={[styles.title, cancelled && styles.titleCancelled]}>
            {event.title}
          </Text>
        )}
        {editing ? null : <Text style={styles.description}>{event.description}</Text>}
        <View style={styles.host}>
          {/* Same colour as this host's pin on the map. */}
          <HostAvatar host={event.host} size={28} />
          <Text style={styles.hostText}>Hosted by {event.host.displayName}</Text>
        </View>
      </View>

      {editing ? (
        <View style={styles.form}>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            accessibilityLabel="Title"
            onChangeText={setTitle}
            style={styles.input}
            value={title}
          />
          {fieldErrors.title ? <Text style={styles.fieldError}>{fieldErrors.title}</Text> : null}

          <Text style={styles.fieldLabel}>What’s happening?</Text>
          <TextInput
            accessibilityLabel="What’s happening?"
            maxLength={140}
            onChangeText={setDescription}
            style={styles.input}
            value={description}
          />
          {fieldErrors.description ? <Text style={styles.fieldError}>{fieldErrors.description}</Text> : null}

          <Text style={styles.fieldLabel}>Category</Text>
          <View accessibilityLabel="Category" accessibilityRole="radiogroup" style={styles.choiceRow}>
            {categories.map((name) => {
              const selected = category === name;
              const text = categoryLabel(name);
              return (
                <Pressable
                  accessibilityLabel={text}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: saving }}
                  disabled={saving}
                  key={name}
                  onPress={() => setCategory(name)}
                  style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}
                >
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{text}</Text>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.category ? <Text style={styles.fieldError}>{fieldErrors.category}</Text> : null}

          <Text style={styles.fieldLabel}>When</Text>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              accessibilityLabel={`When: ${formatWhen(startsAt, now)}`}
              disabled={saving}
              display="compact"
              maximumDate={new Date(Date.now() + MAX_AHEAD_MS)}
              minimumDate={new Date()}
              mode="datetime"
              onValueChange={(_, date) => {
                if (date) {
                  setStartsAtDraft(clampStart(date));
                }
              }}
              value={clampStart(startsAt)}
            />
          ) : (
            <Pressable
              accessibilityHint="Opens a date and time picker"
              accessibilityLabel={`When: ${formatWhen(startsAt, now)}`}
              accessibilityRole="button"
              disabled={saving}
              onPress={() => pickStartOnAndroid(clampStart(startsAt), setStartsAtDraft)}
              style={({ pressed }) => [styles.input, pressed && styles.pressed]}
            >
              <Text style={styles.inputText}>{formatWhen(startsAt, now)}</Text>
            </Pressable>
          )}
          {fieldErrors.startsAt ? <Text style={styles.fieldError}>{fieldErrors.startsAt}</Text> : null}

          <Text style={styles.fieldLabel}>Where exactly?</Text>
          <TextInput
            accessibilityLabel="Where exactly?"
            onChangeText={setLocationLabel}
            style={styles.input}
            value={locationLabel}
          />
          <Text style={styles.help}>The pin stays where it is. This changes the place name.</Text>
          {fieldErrors.locationLabel ? <Text style={styles.fieldError}>{fieldErrors.locationLabel}</Text> : null}

          {editError ? (
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.actionError}>
              {editError}
            </Text>
          ) : null}
          <Pressable
            accessibilityLabel={saving ? 'Saving' : 'Save event'}
            accessibilityRole="button"
            accessibilityState={{ busy: saving, disabled: saving }}
            disabled={saving}
            onPress={() => void save()}
            style={({ pressed }) => [styles.join, pressed && styles.pressed]}
          >
            <Text style={styles.joinText}>{saving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            disabled={saving}
            onPress={() => setEditing(false)}
            style={({ pressed }) => [styles.share, pressed && styles.pressed]}
          >
            <Text style={styles.shareText}>Back</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.details}>
          <View accessible accessibilityLabel={`${formatWhen(startsAt, now)}, ${cancelled ? 'cancelled' : relative}`} style={styles.info}>
            <ClockIcon height={22} width={22} />
            <View style={styles.infoText}>
              <Text style={styles.infoMain}>{formatWhen(startsAt, now)}</Text>
              <Text style={styles.infoSub}>{cancelled ? 'Cancelled by the host' : relative}</Text>
            </View>
          </View>
          <View accessible accessibilityLabel={`Location: ${event.locationLabel}`} style={styles.info}>
            <PlaceIcon height={22} width={22} />
            <View style={styles.infoText}>
              <Text style={styles.infoMain}>{event.locationLabel}</Text>
            </View>
          </View>
        </View>
      )}

      {editing ? null : (
        <>
          <View style={styles.divider} />

          <View
            accessible
            accessibilityLabel={`${event.attendeeCount} going`}
            style={styles.attendees}
          >
            <PeopleIcon height={22} width={22} />
            <Text style={styles.count}>{event.attendeeCount} going</Text>
          </View>

          {event.status === 'active' || event.joined ? (
            <Pressable
              accessibilityLabel={attendanceLabel(event.joined, pendingAction)}
              accessibilityRole="button"
              accessibilityState={{ busy: pending || saving, disabled: pending || saving }}
              disabled={pending || saving}
              onPress={onAttendance}
              style={({ pressed }) => [styles.join, pressed && styles.pressed]}
            >
              <Text style={styles.joinText}>{attendanceLabel(event.joined, pendingAction)}</Text>
            </Pressable>
          ) : null}
          {actionError ? (
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.actionError}>
              {actionError}
            </Text>
          ) : null}
          {editError ? (
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.actionError}>
              {editError}
            </Text>
          ) : null}
          {onRetry ? (
            <Pressable
              accessibilityLabel="Try loading the event again"
              accessibilityRole="button"
              onPress={onRetry}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
          {canHost ? (
            <Pressable
              accessibilityLabel="Edit event"
              accessibilityRole="button"
              disabled={saving}
              onPress={() => {
                setEditError(null);
                setEditing(true);
              }}
              style={({ pressed }) => [styles.share, pressed && styles.pressed]}
            >
              <Text style={styles.shareText}>Edit</Text>
            </Pressable>
          ) : null}
          {canHost ? (
            <Pressable
              accessibilityLabel="Cancel event"
              accessibilityRole="button"
              accessibilityState={{ busy: saving, disabled: saving }}
              disabled={saving}
              onPress={confirmCancel}
              style={({ pressed }) => [styles.share, pressed && styles.pressed]}
            >
              <Text style={styles.shareText}>{saving ? 'Cancelling...' : 'Cancel event'}</Text>
            </Pressable>
          ) : null}
          {event.shareToken ? (
            <Pressable
              accessibilityLabel="Share link"
              accessibilityRole="button"
              onPress={() => void Share.share({ message: eventShareLink(event.id, event.shareToken ?? '') })}
              style={({ pressed }) => [styles.share, pressed && styles.pressed]}
            >
              <Text style={styles.shareText}>Share link</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    bottom: 0,
    elevation: 12,
    left: 0,
    paddingHorizontal: 24,
    paddingTop: 8,
    position: 'absolute',
    right: 0,
    shadowColor: '#1F0F14',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  handleArea: {
    alignItems: 'center',
  },
  handleTarget: {
    paddingVertical: 4,
  },
  handle: {
    backgroundColor: colors.inputLine,
    borderRadius: 2,
    height: 4,
    width: 32,
  },
  close: {
    alignItems: 'center',
    backgroundColor: colors.sand,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    top: 20,
    width: 40,
  },
  placeholder: {
    alignItems: 'center',
    gap: 16,
    justifyContent: 'center',
    minHeight: 200,
    paddingRight: 48,
  },
  failure: {
    color: colors.ink,
    fontSize: 16,
    textAlign: 'center',
  },
  retry: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 20,
  },
  retryText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    paddingBottom: 4,
  },
  header: {
    gap: 10,
    paddingBottom: 16,
    paddingTop: 12,
  },
  // Leaves room for the close button on the right.
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 32,
    paddingRight: 48,
  },
  chip: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '500',
  },
  cancelledChip: {
    backgroundColor: colors.redTint,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelledText: {
    color: colors.redDeep,
    fontSize: 14,
    fontWeight: '600',
  },
  metaText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.displayBold,
    fontSize: 30,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  titleCancelled: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  description: {
    color: colors.inkSoft,
    fontSize: 16,
    lineHeight: 22,
  },
  host: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  hostText: {
    color: colors.muted,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  details: {
    gap: 14,
    paddingBottom: 20,
    paddingTop: 4,
  },
  info: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  infoText: {
    flex: 1,
  },
  infoMain: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  infoSub: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    backgroundColor: colors.divider,
    height: 1,
  },
  attendees: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingTop: 20,
  },
  count: {
    color: colors.ink,
    fontFamily: fonts.displayBold,
    fontSize: 18,
  },
  join: {
    alignItems: 'center',
    backgroundColor: colors.red,
    borderRadius: 28,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 52,
  },
  joinText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  actionError: {
    color: colors.red,
    fontSize: 14,
    marginTop: 8,
  },
  share: {
    alignItems: 'center',
    borderColor: colors.red,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 44,
  },
  shareText: {
    color: colors.redDeep,
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    gap: 8,
    paddingBottom: 12,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.inputLine,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputText: {
    color: colors.ink,
    fontSize: 16,
  },
  help: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldError: {
    color: colors.red,
    fontSize: 13,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceSelected: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  choiceText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '500',
  },
  choiceTextSelected: {
    color: colors.white,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
