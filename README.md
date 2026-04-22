## Next Features / Roadmap

### CRM Usability
- Improve visual styling of the search + filter controls so they feel more integrated with the rest of the UI.
- Consider adding a small “active filter” visual state for All / Future / Overdue buttons.
- Decide whether the default list should always sort by `nextFollowUp`, or only sort when a date filter is active.
- Optionally add a dedicated `Today` date filter if the current Future bucket becomes too broad.
- Consider adding a quick “Clear Search” button near the contact search field.
- Optionally auto-focus the search input when the page loads or when the customer panel closes.

### Follow-Up Workflow
- Refine the follow-up system so `Next FollowUp` becomes a stronger action driver, not just a display field.
- Consider adding quick follow-up action buttons inside the customer panel:
  - Mark Follow-Up Complete
  - Push Follow-Up +7 Days
  - Push Follow-Up +30 Days
- Consider adding a visual warning for contacts with no `nextFollowUp` date.
- Consider adding a stronger “needs attention” view:
  - Overdue
  - Upcoming
  - No Follow-Up Date

### Google Calendar Integration
- Keep current Google Calendar launch flow as V1:
  - `Add To Calendar`
  - open prefilled Google Calendar event in browser
- Improve button labeling for clarity, such as:
  - `Create in Google Calendar`
  - `Open in Google Calendar`
- Decide whether the inline calendar form is needed long-term, since final edits can already be made in Google Calendar.
- If needed later, convert the calendar form from `defaultValue` fields to true controlled state so edits inside the CRM affect the generated Google Calendar event.
- Optionally store calendar metadata in MongoDB later:
  - `calendarEventCreated`
  - `calendarCreatedAt`
  - `calendarEventUrl`
  - `googleCalendarEventId` if true API integration is added later
- Future consideration:
  - full Google Calendar API integration
  - create events directly without opening browser
  - update existing events when follow-up dates change
  - prevent duplicate events

### Keyboard / UX Improvements
- Keep current keyboard navigation for contact search:
  - arrow up / down
  - Enter to open selected contact
- Keep Escape key support for closing the customer panel.
- Consider auto-scrolling the selected keyboard-highlighted contact into view if the list grows longer.
- Consider allowing Enter to open the first visible result if no result is currently selected.

### Contact History / Relationship Tracking
- Add a true contact interaction history log.
- Each history entry could include:
  - date
  - type (`email`, `call`, `meeting`, `text`, `newsletter`, etc.)
  - short note
- Use interaction history to derive or support `lastContact`.
- Display a readable timeline inside the customer panel so the relationship history is easier to understand.
- Consider a quick-add interaction entry workflow:
  - Log Email
  - Log Call
  - Log Meeting

### Email Features
#### Contact-Level Emails
- Add a `Send Intro Email` button inside the customer panel.
- Use this as the first one-to-one email feature connected to Resend.
- On successful send:
  - set `introEmail.sent = true`
  - set `introEmail.sentAt`
- Consider adding a confirmation step before sending.
- Later, add more one-to-one email actions if useful:
  - Send Follow-Up Email
  - Send Proposal Email
  - Send Latest Newsletter to this contact only

#### Top-Level Newsletter Workflow
- Add a top-level button for a newsletter workflow, not a blind one-click send.
- Clicking the button should open a small workflow or modal.
- Workflow should show:
  - current newsletter/template name
  - subject line
  - number of subscribed contacts
  - optional test-send action
  - confirmation before sending
- Newsletter should send only to contacts marked as subscribed.
- Consider adding tracking fields such as:
  - `lastNewsletterSent`
  - `lastNewsletterSubject`
  - `lastNewsletterSentAt`
- Long-term idea:
  - add newsletter send history / campaign log

### Resend / Email Template System
- Learn and document the basics of sending templated emails with Resend.
- Decide where email templates should live:
  - hardcoded in app for now
  - separate template files
  - MongoDB or CMS later
- Start with two simple predefined templates:
  - Intro Email
  - Latest Newsletter
- Create a reusable email sending utility so the app does not repeat send logic in multiple places.
- Add success / error UI feedback for sends.
- Decide how unsubscribe / email status should be respected before sending.

### Data / Model Improvements
- Review the contact schema and decide what should be tracked more explicitly over time.
- Consider adding:
  - `lastNewsletterSent`
  - `calendarEventCreated`
  - `interactionHistory`
  - `noFollowUpNeeded`
- Make sure `emailStatus` is clearly defined and used consistently:
  - subscribed
  - unsubscribed
  - unknown / pending
- Consider whether `lastContact` should remain a manual field or eventually be derived from interaction history.

### Dashboard / Summary Layer
- Add a small summary area at the top of the CRM showing counts such as:
  - total contacts
  - overdue contacts
  - upcoming contacts
  - subscribed contacts
  - contacts with no follow-up date
- This would make the home screen feel more like a working dashboard.

### Future Structural Ideas
- Consider company-level views later so multiple contacts can belong to the same company.
- Consider better note structure later:
  - general notes
  - latest conversation note
  - next step note
- Consider bulk actions later:
  - bulk newsletter send
  - bulk follow-up updates
  - bulk tagging / categorization
- Consider a more advanced contact segmentation system later if email marketing becomes a major use case.

### Technical Cleanup / Consistency
- Standardize date handling everywhere using the same local date parser for `YYYY-MM-DD`.
- Make sure follow-up color logic and follow-up filter logic use the same date comparison method.
- Continue reducing one-off logic and moving reusable behavior into helper functions where it improves clarity.
