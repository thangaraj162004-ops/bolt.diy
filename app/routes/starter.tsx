import { redirect } from 'react-router';

/**
 * Old /starter links: starter templates are not used (their tool configs and
 * frameworks do not run in the in-browser preview), so go to the start page.
 */
export function loader() {
  throw redirect('/');
}

export default function Starter() {
  return null;
}
