import type { MeetingStep } from "@intellicash/shared";
import { meetingSteps } from "@intellicash/shared";

export function getMeetingStepIndex(step: MeetingStep) {
  return meetingSteps.indexOf(step);
}

export function canAdvanceMeetingStep(current: MeetingStep, next: MeetingStep) {
  return getMeetingStepIndex(next) === getMeetingStepIndex(current) + 1;
}

export function assertMeetingStepOrder(completedSteps: MeetingStep[], nextStep: MeetingStep) {
  const expected = meetingSteps[completedSteps.length];

  if (expected !== nextStep) {
    throw new Error(`Expected next meeting step ${expected}, received ${nextStep}.`);
  }
}
