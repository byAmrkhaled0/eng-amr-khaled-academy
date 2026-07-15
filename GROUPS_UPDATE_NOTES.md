# Groups update

- Admin now has a Groups section.
- Booking page loads available groups from Firebase/local data.
- If group capacity is full, it is disabled for booking.
- Approving a booking creates a student, removes the booking, and links the student to groupId/groupName.
- Add Firestore rule for `groups` collection if not already published.
