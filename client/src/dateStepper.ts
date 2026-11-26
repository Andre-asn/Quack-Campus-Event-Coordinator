import { campusDayLabelForAnchor, shiftCampusDay } from './campusTime';

export type DateStepperState = {
  label: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

export function dateStepperState(selectedDay: string, campusAnchorDay: string): DateStepperState {
  return {
    label: campusDayLabelForAnchor(selectedDay, campusAnchorDay),
    canGoBack: selectedDay !== shiftCampusDay(campusAnchorDay, -1),
    canGoForward: selectedDay !== shiftCampusDay(campusAnchorDay, 1),
  };
}

