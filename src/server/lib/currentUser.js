// The single place that answers "whose data is this request about?".
//
// `requireAuth` fills `req.user` from the signed session cookie when
// authentication is enabled (see `auth.json`); without it every request belongs
// to the implicit default user and the per-user UI state is a single global
// document.
export const DEFAULT_USER_ID = 'default';

export function currentUserId(req) {
  return req?.user?.id ?? DEFAULT_USER_ID;
}
