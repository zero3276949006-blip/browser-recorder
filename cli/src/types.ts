/**
 * Shared types for Browser Recorder recordings and generated scripts.
 */

export interface Recording {
  title: string;
  startUrl: string;
  recordedAt: string;
  steps: RecordingStep[];
}

export type RecordingStep =
  | NavigateStep
  | ClickStep
  | DblClickStep
  | InputStep
  | SelectStep
  | CheckStep
  | UploadStep
  | KeydownStep
  | HoverStep
  | WaitStep
  | AssertStep
  | ScreenshotStep;

export interface BaseStep {
  type: string;
  timestamp?: number;
  url?: string;
}

export interface NavigateStep extends BaseStep {
  type: 'navigation';
  url: string;
  title?: string;
}

export interface ClickStep extends BaseStep {
  type: 'click';
  selector: string;
  tagName?: string;
  text?: string;
}

export interface DblClickStep extends BaseStep {
  type: 'dblclick';
  selector: string;
  tagName?: string;
}

export interface InputStep extends BaseStep {
  type: 'input';
  selector: string;
  value: string;
  inputType?: string;
  tagName?: string;
}

export interface SelectStep extends BaseStep {
  type: 'select';
  selector: string;
  value: string;
  tagName?: string;
}

export interface CheckStep extends BaseStep {
  type: 'check';
  selector: string;
  checked: boolean;
  tagName?: string;
}

export interface UploadStep extends BaseStep {
  type: 'upload';
  selector: string;
  files: string[];
}

export interface KeydownStep extends BaseStep {
  type: 'keydown';
  key: string;
  selector?: string;
}

export interface HoverStep extends BaseStep {
  type: 'hover';
  selector: string;
  tagName?: string;
}

export interface WaitStep extends BaseStep {
  type: 'wait';
  selector?: string;
  ms?: number;
  state?: 'visible' | 'hidden' | 'attached' | 'detached';
}

export interface AssertStep extends BaseStep {
  type: 'assert';
  selector: string;
  assertType: 'visible' | 'hidden' | 'text' | 'value' | 'count' | 'url' | 'title';
  expected?: string | number | null;
}

export interface ScreenshotStep extends BaseStep {
  type: 'screenshot';
  label?: string;
}

export interface GeneratorOptions {
  /** Output format */
  format: 'test' | 'script';
  /** Test framework for test format */
  framework?: 'playwright' | 'jest';
  /** Whether to extract repeated values as variables */
  parameterize?: boolean;
  /** Insert smart waits between steps */
  smartWait?: boolean;
  /** Default wait time between steps (ms) */
  defaultWait?: number;
  /** Include screenshot on failure */
  screenshotOnFailure?: boolean;
}

export interface GeneratedScript {
  filename: string;
  code: string;
  imports: string[];
  variables: Map<string, string>;
}
