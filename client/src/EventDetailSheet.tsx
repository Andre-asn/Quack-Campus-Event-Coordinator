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
import { loadAnnouncements, postAnnouncement, type Announcement } from './announcements';
import { openCalendarEditor } from './deviceCalendar';
import { cancelEvent, loadEventDetail, setAttendance, updateEvent, type EventDetail } from './eventDetail';
import {
  cancelLocalReminder,
  chooseReminder,
  clearReminder,
  loadReminder,
  syncReminders,
  type LeadMinutes,
} from './reminders';
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
  const pendingRef = useRef(false);
  const stateRef = useRef<State>(state);
  pendingRef.current = pending;
  stateRef.current = state;
  const calendarOfferShown = useRef(false);
  const calendarActionStarted = useRef(false);
  const mounted = useRef(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const offset = useSharedValue(reduced ? 0 : windowHeight);
  const opacity = useSharedValue(reduced ? 0 : 1);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    calendarOfferShown.current = false;
    calendarActionStarted.current = false;
  }, [eventId]);

  function offerCalendar(event: EventDetail) {
    if (!mounted.current || calendarOfferShown.current) {
      return;
    }
    calendarOfferShown.current = true;
    Alert.alert(
      'Add to calendar?',
      'Leaving this event in Quack won’t remove it from your calendar.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Add to calendar',
          onPress: () => {
            if (calendarActionStarted.current) {
              return;
            }
            calendarActionStarted.current = true;
            void openCalendarEditor(event).then((result) => {
              if (result.ok || !mounted.current) {
                return;
              }
              Alert.alert(
                result.reason === 'invalid-time' ? 'Can’t add to calendar' : 'Calendar unavailable',
                result.reason === 'invalid-time'
                  ? 'This event has no valid end time, so its duration is unavailable.'
                  : 'The device calendar editor could not be opened. Your Quack join is still intact.',
              );
            });
          },
        },
      ],
    );
  }

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
        if (result.ok && (result.event.status === 'cancelled' || !result.event.joined)) {
          void cancelLocalReminder(eventId);
        }
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
    if (outcome.ok && !joining) {
      const cleared = await clearReminder(sessionId, eventId, token);
      if (!cleared) {
        await cancelLocalReminder(eventId);
      }
    }
    if (refreshed?.ok) {
      setNeedsRefresh(false);
      setState({ status: 'loaded', event: refreshed.event });
      if (outcome.ok && joining) {
        offerCalendar(refreshed.event);
      }
      if (outcome.ok && !joining) {
        calendarOfferShown.current = false;
        calendarActionStarted.current = false;
      }
      if (!outcome.ok && refreshed.event.joined !== joining) {
        setActionError(outcome.message);
      }
      return;
    }
    if (outcome.ok) {
      if (joining) {
        offerCalendar({ ...previous, joined: true });
      } else {
        calendarOfferShown.current = false;
        calendarActionStarted.current = false;
      }
      setNeedsRefresh(true);
      setActionError('Couldn’t refresh this event. Try again.');
      return;
    }
    setNeedsRefresh(false);
    setState({ status: 'loaded', event: previous });
    setActionError(outcome.message);
  }

  const refreshOpenEvent = useCallback(async () => {
    if (pendingRef.current || stateRef.current.status !== 'loaded') {
      return;
    }
    const seen = attendanceRequest.current;
    const previous = stateRef.current.event;
    let result: Awaited<ReturnType<typeof loadEventDetail>>;
    try {
      result = await loadEventDetail(sessionId, eventId, undefined, token);
    } catch {
      return;
    }
    if (!mounted.current || pendingRef.current || seen !== attendanceRequest.current) {
      return;
    }
    if (!result.ok) {
      return;
    }
    setState({ status: 'loaded', event: result.event });
    if (result.event.status === 'cancelled' || !result.event.joined) {
      await cancelLocalReminder(eventId);
      return;
    }
    if (previous.startsAt !== result.event.startsAt || previous.status !== result.event.status) {
      await syncReminders(sessionId);
    }
  }, [sessionId, eventId, token]);

  // A failed refresh keeps the event already on screen, so a successful cancel still shows Cancelled.
  const refreshKeeping = useCallback(async (fallback: EventDetail) => {
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
    const event = refreshed?.ok ? refreshed.event : fallback;
    if (refreshed?.ok) {
      setNeedsRefresh(false);
      setActionError(null);
    } else {
      setNeedsRefresh(true);
      setActionError('Couldn’t refresh this event. Try again.');
    }
    setState({ status: 'loaded', event });
    if (event.status === 'cancelled' || !event.joined) {
      await cancelLocalReminder(eventId);
    }
  }, [sessionId, eventId, token]);

  // Keeps the relative time, the starting-soon marker, and a cancel or new start time current.
  const openStart = state.status === 'loaded' ? state.event.startsAt : null;
  const openStatus = state.status === 'loaded' ? state.event.status : null;
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
      void refreshOpenEvent();
    }, 30_000);
    return () => clearInterval(timer);
  }, [refreshOpenEvent]);

  useEffect(() => {
    if (openStart === null || openStatus !== 'active') {
      return;
    }
    const start = new Date(openStart).getTime();
    const marks = [start - 3_600_000, start].filter((time) => time > Date.now());
    if (marks.length === 0) {
      return;
    }
    const delay = Math.min(...marks) - Date.now() + 250;
    const timer = setTimeout(() => {
      void refreshOpenEvent();
    }, delay);
    return () => clearTimeout(timer);
  }, [openStart, openStatus, refreshOpenEvent]);

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
          onCancelled={(event) => {
            const cancelledEvent: EventDetail = { ...event, status: 'cancelled' };
            setState({ status: 'loaded', event: cancelledEvent });
            setNeedsRefresh(false);
            setActionError(null);
            onChanged?.();
            void refreshKeeping(cancelledEvent);
          }}
          onRetry={needsRefresh && state.status === 'loaded'
            ? () => void refreshKeeping(state.event)
            : needsRefresh
              ? () => setAttempt((value) => value + 1)
              : undefined}
          onSaved={() => {
            setAttempt((value) => value + 1);
            onChanged?.();
          }}
          pending={pending}
          pendingAction={pendingAction}
          sessionId={sessionId}
          token={token}
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
  token,
  onSaved,
  onCancelled,
}: {
  event: EventDetail;
  now: Date;
  pending: boolean;
  pendingAction: 'join' | 'leave' | null;
  actionError: string | null;
  onAttendance: () => void;
  onRetry?: () => void;
  sessionId: string;
  token?: string | null;
  onSaved: () => void;
  onCancelled: (event: EventDetail) => void;
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
  // A selected day is presentation context; only a valid end timestamp determines lifecycle.
  // Legacy NULL end times retain their existing policy and are not inferred to have ended.
  const ended = !cancelled && isEnded(event.endsAt, now);
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
    onCancelled(event);
  }

  const storedStart = new Date(event.startsAt);
  const shownStart = startsAtDraft ?? storedStart;
  const clampedShown = clampStart(shownStart);
  // The iOS picker cannot show a past time or a time past its maximum. Until the host picks a new
  // one, show the time Save will send rather than a clamped value.
  const iosShowsStoredTime = Platform.OS === 'ios' && clampedShown.getTime() !== shownStart.getTime();

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
          ) : event.startingSoon && startsAt.getTime() > now.getTime() ? (
            <View accessibilityLabel="Starting soon" style={styles.soonChip}>
              <Text style={styles.soonText}>Starting soon</Text>
            </View>
          ) : ended ? (
            <View accessibilityLabel="This event has ended" style={styles.endedChip}>
              <Text style={styles.endedText}>Ended</Text>
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
          {iosShowsStoredTime ? (
            <Pressable
              accessibilityHint="Opens a date and time picker. The current start is kept until you choose a new one."
              accessibilityLabel={`When: ${formatWhen(shownStart, now)}`}
              accessibilityRole="button"
              disabled={saving}
              onPress={() => setStartsAtDraft(clampedShown)}
              style={({ pressed }) => [styles.input, pressed && styles.pressed]}
            >
              <Text style={styles.inputText}>{formatWhen(shownStart, now)}</Text>
            </Pressable>
          ) : Platform.OS === 'ios' ? (
            <DateTimePicker
              accessibilityLabel={`When: ${formatWhen(shownStart, now)}`}
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
              value={clampedShown}
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
          <View accessible accessibilityLabel={`${formatWhen(startsAt, now)}, ${cancelled ? 'cancelled' : ended ? 'ended' : relative}`} style={styles.info}>
            <ClockIcon height={22} width={22} />
            <View style={styles.infoText}>
              <Text style={styles.infoMain}>{formatWhen(startsAt, now)}</Text>
              <Text style={styles.infoSub}>{cancelled ? 'Cancelled by the host' : ended ? 'This event has ended' : relative}</Text>
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

          {(event.status === 'active' && !ended) || event.joined ? (
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
          {event.joined ? (
            <Text accessibilityLabel="Leaving this event in Quack won’t remove it from your calendar." style={styles.calendarReminder}>
              Leaving this event in Quack won’t remove it from your calendar.
            </Text>
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
          <Announcements event={event} sessionId={sessionId} token={token} />
          {event.joined && event.status === 'active' && !ended ? (
            <Reminder event={event} sessionId={sessionId} token={token} />
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

function Announcements({
  event,
  sessionId,
  token,
}: {
  event: EventDetail;
  sessionId: string;
  token?: string | null;
}) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    loadAnnouncements(sessionId, event.id, token).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setItems(result.announcements);
        return;
      }
      setItems([]);
      setLoadError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, event.id, token]);

  async function post() {
    if (posting) {
      return;
    }
    setPosting(true);
    setMessage(null);
    const outcome = await postAnnouncement(sessionId, event.id, draft);
    setPosting(false);
    if (!outcome.ok) {
      setMessage(outcome.message);
      return;
    }
    setDraft('');
    setItems((current) => [outcome.announcement, ...(current ?? [])]);
  }

  return (
    <View style={styles.extra}>
      <Text style={styles.extraTitle}>Announcements</Text>
      {loadError ? (
        <Text accessibilityRole="alert" style={styles.actionError}>{loadError}</Text>
      ) : items === null ? (
        <Text style={styles.rowMeta}>Loading announcements...</Text>
      ) : items.length === 0 ? (
        <Text style={styles.rowMeta}>No announcements yet.</Text>
      ) : null}
      {(items ?? []).map((item) => (
        <View key={item.id}>
          <Text style={styles.extraBody}>{item.body}</Text>
          <Text style={styles.rowMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
      ))}
      {event.hosting && event.status === 'active' ? (
        <>
          <TextInput
            accessibilityLabel="Announcement"
            maxLength={280}
            onChangeText={(text) => {
              setDraft(text);
              setMessage(null);
            }}
            placeholder="Where to meet, or what to bring"
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityLabel="Post announcement"
            accessibilityRole="button"
            disabled={posting}
            onPress={() => void post()}
            style={({ pressed }) => [styles.share, pressed && styles.pressed]}
          >
            <Text style={styles.shareText}>{posting ? 'Posting...' : 'Post announcement'}</Text>
          </Pressable>
        </>
      ) : null}
      {message ? (
        <Text accessibilityRole="alert" style={styles.actionError}>{message}</Text>
      ) : null}
    </View>
  );
}

function Reminder({
  event,
  sessionId,
  token,
}: {
  event: EventDetail;
  sessionId: string;
  token?: string | null;
}) {
  const [lead, setLead] = useState<LeadMinutes | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setBusy(false);
    loadReminder(sessionId, event.id, token).then((value) => {
      if (current === generation.current) {
        setLead(value);
      }
    });
    return () => {
      generation.current += 1;
    };
  }, [sessionId, event.id, token]);

  async function choose(next: LeadMinutes) {
    if (busy) {
      return;
    }
    const current = generation.current;
    setBusy(true);
    setMessage(null);
    const outcome = await chooseReminder(sessionId, event.id, event.title, event.startsAt, next, token);
    if (current !== generation.current) {
      await cancelLocalReminder(event.id);
      return;
    }
    setBusy(false);
    if (!outcome.ok) {
      setMessage(outcome.message);
      const loaded = await loadReminder(sessionId, event.id, token);
      if (current === generation.current) {
        setLead(loaded);
      }
      return;
    }
    setLead(next);
  }

  async function turnOff() {
    if (busy) {
      return;
    }
    const current = generation.current;
    setBusy(true);
    setMessage(null);
    const cleared = await clearReminder(sessionId, event.id, token);
    if (current !== generation.current) {
      return;
    }
    setBusy(false);
    if (!cleared) {
      setMessage('Couldn’t turn off the reminder. Try again.');
      return;
    }
    setLead(null);
  }

  return (
    <View style={styles.extra}>
      <Text style={styles.extraTitle}>Remind me</Text>
      <View style={styles.reminderRow}>
        <Pressable
          accessibilityLabel="Remind me 1 hour before"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, selected: lead === 60 }}
          disabled={busy}
          onPress={() => void choose(60)}
          style={({ pressed }) => [styles.share, lead === 60 && styles.reminderSelected, pressed && styles.pressed]}
        >
          <Text style={styles.shareText}>1 hour before</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Remind me 15 minutes before"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, selected: lead === 15 }}
          disabled={busy}
          onPress={() => void choose(15)}
          style={({ pressed }) => [styles.share, lead === 15 && styles.reminderSelected, pressed && styles.pressed]}
        >
          <Text style={styles.shareText}>15 minutes before</Text>
        </Pressable>
        {lead !== null ? (
          <Pressable
            accessibilityLabel="Don't remind me"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void turnOff()}
            style={({ pressed }) => [styles.share, pressed && styles.pressed]}
          >
            <Text style={styles.shareText}>Don't remind me</Text>
          </Pressable>
        ) : null}
      </View>
      {message ? (
        <Text accessibilityRole="alert" style={styles.actionError}>{message}</Text>
      ) : null}
    </View>
  );
}

function isEnded(endsAt: string | null, now: Date): boolean {
  if (!endsAt) {
    return false;
  }
  const end = new Date(endsAt);
  return Number.isFinite(end.getTime()) && now.getTime() >= end.getTime();
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
  endedChip: {
    backgroundColor: colors.sand,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  soonChip: {
    backgroundColor: colors.yellow,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  soonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  endedText: {
    color: colors.muted,
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
  calendarReminder: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
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
  extra: {
    gap: 8,
    paddingTop: 16,
  },
  extraTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  extraBody: {
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 20,
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 13,
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
  reminderRow: {
    gap: 8,
  },
  reminderSelected: {
    backgroundColor: colors.redTint,
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
