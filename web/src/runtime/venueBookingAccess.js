export function canSubmitVenueBooking(context) {
  return Boolean(context && ((context.role === 'user' && context.assignmentId)
    || (context.role === 'admin' && context.adminLevel === 'super_admin')));
}
