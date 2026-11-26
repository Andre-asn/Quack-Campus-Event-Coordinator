import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { campusDateTime } from './campusTime';
import { colors } from './theme';

export type FreeWindow = { from: string; to: string };

type Props = {
  dayKey: string;
  value: FreeWindow | null;
  onChange: (value: FreeWindow | null) => void;
};

function label(hours: number, minutes: number): string {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Times are on the selected campus day and combine with the viewport query.
export default function FreeWindowControl({ dayKey, value, onChange }: Props) {
  const [start, setStart] = useState({ hours: 14, minutes: 0 });
  const [end, setEnd] = useState({ hours: 18, minutes: 0 });
  const [message, setMessage] = useState<string | null>(null);

  function pick(current: { hours: number; minutes: number }, apply: (hours: number, minutes: number) => void) {
    const seed = new Date();
    seed.setHours(current.hours, current.minutes, 0, 0);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: seed,
        mode: 'time',
        onValueChange: (_, date) => {
          if (date) {
            apply(date.getHours(), date.getMinutes());
          }
        },
      });
    }
  }

  function apply() {
    const from = campusDateTime(dayKey, start.hours, start.minutes);
    const to = campusDateTime(dayKey, end.hours, end.minutes);
    if (new Date(to).getTime() <= new Date(from).getTime()) {
      setMessage('The end of your free time has to be after the start.');
      return;
    }
    setMessage(null);
    onChange({ from, to });
  }

  return (
    <View style={styles.box}>
      <Text style={styles.label}>I’m free</Text>
      <View style={styles.row}>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            accessibilityLabel={`Free from ${label(start.hours, start.minutes)}`}
            display="compact"
            mode="time"
            onValueChange={(_, date) => {
              if (date) {
                setStart({ hours: date.getHours(), minutes: date.getMinutes() });
              }
            }}
            value={(() => {
              const date = new Date();
              date.setHours(start.hours, start.minutes, 0, 0);
              return date;
            })()}
          />
        ) : (
          <Pressable
            accessibilityLabel={`Free from ${label(start.hours, start.minutes)}`}
            accessibilityRole="button"
            onPress={() => pick(start, (hours, minutes) => setStart({ hours, minutes }))}
            style={styles.time}
          >
            <Text style={styles.timeText}>{label(start.hours, start.minutes)}</Text>
          </Pressable>
        )}
        <Text style={styles.to}>to</Text>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            accessibilityLabel={`Free until ${label(end.hours, end.minutes)}`}
            display="compact"
            mode="time"
            onValueChange={(_, date) => {
              if (date) {
                setEnd({ hours: date.getHours(), minutes: date.getMinutes() });
              }
            }}
            value={(() => {
              const date = new Date();
              date.setHours(end.hours, end.minutes, 0, 0);
              return date;
            })()}
          />
        ) : (
          <Pressable
            accessibilityLabel={`Free until ${label(end.hours, end.minutes)}`}
            accessibilityRole="button"
            onPress={() => pick(end, (hours, minutes) => setEnd({ hours, minutes }))}
            style={styles.time}
          >
            <Text style={styles.timeText}>{label(end.hours, end.minutes)}</Text>
          </Pressable>
        )}
        <Pressable accessibilityLabel="Show events during my free time" accessibilityRole="button" onPress={apply} style={styles.apply}>
          <Text style={styles.applyText}>{value ? 'Update' : 'Apply'}</Text>
        </Pressable>
        {value ? (
          <Pressable
            accessibilityLabel="Clear free time filter"
            accessibilityRole="button"
            onPress={() => {
              setMessage(null);
              onChange(null);
            }}
            style={styles.clear}
          >
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {message ? (
        <Text accessibilityRole="alert" style={styles.error}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 8,
    paddingBottom: 8,
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  time: {
    backgroundColor: colors.paper,
    borderColor: colors.inputLine,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  timeText: {
    color: colors.ink,
    fontSize: 15,
  },
  to: {
    color: colors.muted,
    fontSize: 14,
  },
  apply: {
    backgroundColor: colors.red,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  applyText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  clear: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  clearText: {
    color: colors.redDeep,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: colors.red,
    fontSize: 13,
  },
});
