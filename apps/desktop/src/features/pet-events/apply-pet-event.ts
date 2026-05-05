import { ActionType } from '../actions/action-schema';
import { PetStateEvent, PetTTSOptions } from './pet-event-schema';

interface PetEventControls {
  currentAction: ActionType;
  clearActionResetTimer: () => void;
  setAction: (action: ActionType) => void;
  scheduleIdle: (delay: number) => void;
  handleSpeech: (text: string, ttsOpts?: boolean | PetTTSOptions) => void;
}

export function applyPetStateEvent(event: PetStateEvent, controls: PetEventControls): void {
  controls.clearActionResetTimer();

  if (event.mode === 'continuous') {
    if (controls.currentAction !== event.action) {
      controls.setAction(event.action);
    }
  } else {
    controls.setAction(event.action);
    if (event.resetAfterMs !== undefined) {
      controls.scheduleIdle(event.resetAfterMs);
    }
  }

  const speechText = event.text || event.message || '';
  if (speechText) {
    controls.handleSpeech(speechText, event.tts);
  }
}
