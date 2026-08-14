// Send a saved email template — single-contact Custom Action.
//
// Setup:
//   1. Save and enable an email template in the Email Templates editor.
//   2. Replace "Order Follow Up" below with that template's exact saved name.
//   3. Create a Contact custom action and paste this file into its code box.
//
// page.evaluate(...) GENERATES the final outbound email for this contact:
// it resolves the saved template's variables, recipient rule, variation,
// reply mode, and sender settings. actions.sendEmail(...) then sends that
// generated result through the normal email transport and tracking pipeline.

const email = await page.evaluate(user.email("Order Follow Up"));

// The generated message is mutable before it is sent. These are optional:
// email.appendSubject(` — ${page.contact.contactName}`);
// email.append("<p>Extra copy for this one contact.</p>");

await actions.sendEmail(email);

return `Sent “${email.name}” to ${email.to || page.contact.email}`;
