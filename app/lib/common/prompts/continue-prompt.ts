import { stripIndents } from '~/utils/stripIndent';

/** Sent when a response hit the token limit, so the model picks up where it stopped. */
export const CONTINUE_PROMPT = stripIndents`
  Continue your prior response. IMPORTANT: Immediately begin from where you left off without any interruptions.
  Do not repeat any content, including artifact and action tags.
`;
