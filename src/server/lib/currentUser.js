// The single place that answers "whose data is this request about?".
//
// Until authentication exists every request belongs to the implicit default
// user, so the per-user UI state is effectively a single global document. When a
// session/token is added, this is the only function that has to change; the
// routes and services already scope their reads and writes by the returned id.
export const DEFAULT_USER_ID = 'default';

export function currentUserId(req) {
  return req?.user?.id ?? DEFAULT_USER_ID;
}
