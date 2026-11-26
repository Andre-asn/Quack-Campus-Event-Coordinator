export type MapLoadingState = {
  loaded: boolean;
  loadError: boolean;
};

export function mapQueryStarted(previous: MapLoadingState, dayChanged: boolean): MapLoadingState {
  return {
    loaded: dayChanged ? false : previous.loaded,
    loadError: false,
  };
}

export function mapQueryFailed(): MapLoadingState {
  return { loaded: false, loadError: true };
}
