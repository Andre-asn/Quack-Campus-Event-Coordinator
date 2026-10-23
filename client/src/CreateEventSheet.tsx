import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import CenterPin from '../assets/create/center-pin.svg';
import CheckIcon from '../assets/create/check.svg';
import ClockIcon from '../assets/create/clock.svg';
import CloseIcon from '../assets/create/close.svg';
import PinShadow from '../assets/create/pin-shadow.svg';
import PlaceIcon from '../assets/create/place.svg';
import type { PinnedPlace } from './CampusMap';
import { createEvent } from './events';
import { colors, fonts } from './theme';

const categories = ['study', 'food', 'sports', 'games', 'movie', 'music', 'other'] as const;
type Category = (typeof categories)[number];
type FieldName = 'title' | 'description' | 'label';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const SHEET_SPRING = { duration: 300, dampingRatio: 0.8 };

// Where a flick would come to rest, so a quick short swipe still snaps.
function project(velocity: number) {
  'worklet';
  return ((velocity / 1000) * 0.998) / (1 - 0.998);
}

// The further past an edge, the less the sheet follows.
function rubberband(overshoot: number, dimension: number) {
  'worklet';
  return (overshoot * dimension * 0.55) / (dimension + 0.55 * Math.abs(overshoot));
}

// 7:05 PM becomes 8:00 PM; 11:30 PM becomes midnight tomorrow.
function nextRoundHour(): Date {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date;
}

function formatWhen(date: Date): string {
  const day = date.toDateString() === new Date().toDateString() ? 'Today' : 'Tomorrow';
  return `${day}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

type Props = {
  sessionId: string;
  place: PinnedPlace | null;
  onInset: (height: number) => void;
  onClose: () => void;
  onPosted: () => void;
};

export default function CreateEventSheet({ sessionId, place, onInset, onClose, onPosted }: Props) {
  const insets = useSafeAreaInsets();
  const descriptionRef = useRef<TextInput>(null);
  const [startsAt] = useState(nextRoundHour);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  // null until the host types, so the label keeps following the map as the pin moves.
  const [typedLabel, setTypedLabel] = useState<string | null>(null);
  const [focused, setFocused] = useState<FieldName | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [peekHeight, setPeekHeight] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reduced = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  // How far the sheet sits below its open position: 0 open, peekY collapsed, sheetHeight gone.
  const offset = useSharedValue(windowHeight);
  const opacity = useSharedValue(reduced ? 0 : 1);
  const dragStart = useSharedValue(0);
  const peekY = sheetHeight - peekHeight;

  // Runs when the sheet comes to rest, so the map re-centers the pin once, not every frame.
  function settle(toCollapsed: boolean) {
    setCollapsed(toCollapsed);
    onInset(toCollapsed ? peekHeight : sheetHeight);
    if (toCollapsed) {
      Keyboard.dismiss();
    }
  }

  function snapTo(toCollapsed: boolean) {
    offset.set(withSpring(toCollapsed ? peekY : 0, SHEET_SPRING));
    settle(toCollapsed);
  }

  // Exit is quicker than entry: the host is done with the sheet.
  function leave(then: () => void) {
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) {
        scheduleOnRN(then);
      }
    };
    if (reduced) {
      opacity.set(withTiming(0, { duration: 150 }, done));
    } else {
      offset.set(withTiming(sheetHeight, { duration: 200, easing: EASE_OUT }, done));
    }
  }

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .onStart(() => {
          dragStart.set(offset.get());
        })
        .onUpdate((event) => {
          const next = dragStart.get() + event.translationY;
          if (next < 0) {
            offset.set(rubberband(next, sheetHeight));
          } else if (next > peekY) {
            offset.set(peekY + rubberband(next - peekY, sheetHeight));
          } else {
            offset.set(next);
          }
        })
        .onEnd((event) => {
          const toCollapsed = offset.get() + project(event.velocityY) > peekY / 2;
          offset.set(withSpring(toCollapsed ? peekY : 0, { ...SHEET_SPRING, velocity: event.velocityY }));
          scheduleOnRN(settle, toCollapsed);
        }),
    // settle reads the measured heights, which change only on first layout.
    [peekY, sheetHeight],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: offset.get() }],
  }));
  // The hint is for placing the pin, so it shows only while the map is uncovered.
  const hintStyle = useAnimatedStyle(() => ({
    opacity: peekY > 0 ? interpolate(offset.get(), [0, peekY], [0, 1], Extrapolation.CLAMP) : 1,
  }));
  // The pin rides at the middle of the visible map, so it moves half as far as the sheet.
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.min(offset.get(), sheetHeight) / 2 }],
  }));

  const suggestedLabel = place?.name ?? '';
  const label = typedLabel ?? suggestedLabel;
  const ready = Boolean(title.trim() && description.trim() && category && label.trim() && place) && !busy;
  const when = formatWhen(startsAt);

  async function post() {
    if (!place || !category) {
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await createEvent(sessionId, {
      title: title.trim(),
      description: description.trim(),
      category,
      latitude: place.latitude,
      longitude: place.longitude,
      locationLabel: label.trim(),
      startsAt: startsAt.toISOString(),
    });
    if (outcome.ok) {
      AccessibilityInfo.announceForAccessibility('Event posted');
      leave(onPosted);
      return;
    }
    setBusy(false);
    setError(outcome.message);
  }

  function inputProps(name: FieldName) {
    return {
      onBlur: () => setFocused(null),
      onFocus: () => setFocused(name),
      placeholderTextColor: colors.muted,
      style: [styles.input, focused === name && styles.inputFocused],
    };
  }

  return (
    <>
      <Animated.View
        accessibilityElementsHidden={!collapsed}
        importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
        pointerEvents="none"
        style={[styles.hintRow, { top: insets.top + 16 }, hintStyle]}
      >
        <Text style={styles.hint}>Move the map to place your pin</Text>
      </Animated.View>
      {sheetHeight > 0 ? (
        // The pin's tip sits on the map center, which the camera keeps above the sheet.
        <View pointerEvents="none" style={[styles.pinArea, { bottom: sheetHeight }]}>
          <Animated.View style={[styles.pin, pinStyle]}>
            <CenterPin height={52} width={40} />
            <PinShadow height={6} style={styles.pinShadow} width={18} />
          </Animated.View>
        </View>
      ) : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        style={styles.keyboard}
      >
        <Animated.View
          onLayout={(event) => {
            // Measured once, so typing never moves the map under the pin.
            if (!sheetHeight) {
              const height = event.nativeEvent.layout.height;
              setSheetHeight(height);
              onInset(height);
              if (reduced) {
                offset.set(0);
                opacity.set(withTiming(1, { duration: 200 }));
              } else {
                offset.set(height);
                offset.set(withSpring(0, { duration: 300, dampingRatio: 1 }));
              }
            }
          }}
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }, sheetStyle]}
        >
          <GestureDetector gesture={drag}>
            <View
              onLayout={(event) => {
                const { y, height } = event.nativeEvent.layout;
                // Collapsed, only the handle and heading stay above the home indicator.
                setPeekHeight(y + height + 12 + insets.bottom);
              }}
              style={styles.grab}
            >
              <Pressable
                accessibilityLabel={collapsed ? 'Expand sheet' : 'Collapse sheet'}
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }}
                onPress={() => snapTo(!collapsed)}
                style={styles.handleTarget}
              >
                <View style={styles.handle} />
              </Pressable>
              <View style={styles.heading}>
                <Text accessibilityRole="header" style={styles.headingText}>
                  Pin an event
                </Text>
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  hitSlop={4}
                  onPress={() => leave(onClose)}
                  style={({ pressed }) => [styles.close, pressed && styles.pressed]}
                >
                  <CloseIcon height={20} width={20} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>

          <ScrollView contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
            <Field label="Title">
              <TextInput
                {...inputProps('title')}
                accessibilityLabel="Title"
                blurOnSubmit={false}
                onChangeText={setTitle}
                onSubmitEditing={() => descriptionRef.current?.focus()}
                placeholder="Study session"
                returnKeyType="next"
                value={title}
              />
            </Field>

            <Field help="One line. Nearby students see it on the map." label="What’s happening?" trailing={`${description.length}/140`}>
              <TextInput
                {...inputProps('description')}
                accessibilityHint="One line, up to 140 characters"
                accessibilityLabel="What’s happening?"
                maxLength={140}
                onChangeText={setDescription}
                placeholder="Studying for CS102!"
                ref={descriptionRef}
                value={description}
              />
            </Field>

            <View style={styles.field}>
              <Text style={styles.label}>Category</Text>
              <View accessibilityLabel="Category" accessibilityRole="radiogroup" style={styles.chips}>
                {categories.map((name) => {
                  const selected = category === name;
                  const text = name[0].toUpperCase() + name.slice(1);
                  return (
                    <Pressable
                      accessibilityLabel={text}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={name}
                      onPress={() => setCategory(name)}
                      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
                    >
                      {selected ? <CheckIcon height={18} width={18} /> : null}
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{text}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Field help="Defaults to the next hour. Up to 48 hours ahead." label="When">
              <View accessibilityLabel={`When: ${when}`} accessible style={[styles.input, styles.inputRow]}>
                <ClockIcon height={20} width={20} />
                <Text style={styles.inputText}>{when}</Text>
              </View>
            </Field>

            <Field
              help={typedLabel === null && suggestedLabel
                ? 'Filled in from the map. Add a room or floor if it helps.'
                : 'Type a room or landmark so people can find you.'}
              label="Where exactly?"
            >
              <View style={[styles.input, styles.inputRow, focused === 'label' && styles.inputFocused]}>
                <PlaceIcon height={20} width={20} />
                <TextInput
                  {...inputProps('label')}
                  accessibilityLabel="Where exactly?"
                  onChangeText={setTypedLabel}
                  placeholder="Library, 3rd floor"
                  style={styles.inputText}
                  value={label}
                />
              </View>
            </Field>
          </ScrollView>

          {error ? (
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityLabel="Post event"
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: !ready }}
            disabled={!ready}
            onPress={() => void post()}
            style={({ pressed }) => [styles.post, !ready && styles.postDisabled, pressed && styles.pressed]}
          >
            <Text style={styles.postText}>{busy ? 'Posting...' : 'Post event'}</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );
}

function Field({ label, help, trailing, children }: { label: string; help?: string; trailing?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {help ? (
        <View style={styles.helpRow}>
          <Text style={[styles.help, styles.helpText]}>{help}</Text>
          {trailing ? <Text style={styles.help}>{trailing}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hintRow: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  hint: {
    backgroundColor: colors.ink,
    borderRadius: 16,
    color: colors.white,
    fontSize: 13,
    fontWeight: '500',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pinArea: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  // Twice the pin's height, so the tip lands on the center line.
  pin: {
    alignItems: 'center',
    height: 104,
  },
  pinShadow: {
    marginTop: -4,
  },
  keyboard: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    elevation: 12,
    gap: 14,
    maxHeight: '78%',
    paddingHorizontal: 24,
    paddingTop: 8,
    shadowColor: '#1F0F14',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  grab: {
    gap: 14,
  },
  handleTarget: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  handle: {
    backgroundColor: colors.inputLine,
    borderRadius: 2,
    height: 4,
    width: 32,
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  headingText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.displayBold,
    fontSize: 24,
    letterSpacing: -0.48,
  },
  close: {
    alignItems: 'center',
    backgroundColor: colors.sand,
    borderRadius: 24,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  fields: {
    gap: 14,
  },
  field: {
    gap: 6,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.inputLine,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputFocused: {
    borderColor: colors.red,
    borderWidth: 2,
    // Keeps the text still when the border thickens.
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  inputText: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  helpRow: {
    flexDirection: 'row',
    gap: 8,
  },
  help: {
    color: colors.muted,
    fontSize: 12,
  },
  helpText: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  chipSelected: {
    backgroundColor: colors.redTint,
    borderColor: colors.redTint,
    paddingLeft: 8,
  },
  chipText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.redDeep,
  },
  error: {
    color: colors.red,
    fontSize: 14,
  },
  post: {
    alignItems: 'center',
    backgroundColor: colors.red,
    borderRadius: 28,
    minHeight: 52,
    justifyContent: 'center',
  },
  postDisabled: {
    opacity: 0.5,
  },
  postText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
