// Sample emails with realistic data, for the mockups. The wording here is the proposed new copy.
import { b, link } from "./email-template.mjs";
const entries = "competitions@ynepf.co.uk";

// Shown in every email that comes before competition day (the confirmation and the lifting order). The links are the same pages the site already uses.
const TECH_RULES = "https://www.powerlifting.sport/rules/codes/info/technical-rules", APPROVED_LIST = "https://www.powerlifting.sport/rules/codes/info/approved-list";
export const RULES_AND_KIT = [
  ["h2", "Before competition day"],
  ["p", `Please make sure you know the current ${link(TECH_RULES, "IPF Technical Rules")}. It is up to you to have read and understood them before you lift.`],
  ["p", `Please also check that your kit is on the ${link(APPROVED_LIST, "IPF approved list")}. Any kit that is not compliant will be rejected, and referees will not make exceptions, so check it now rather than at weigh-in.`],
  ["p", `Not sure about something? Email us at ${link("mailto:info@ynepf.co.uk", "info@ynepf.co.uk")} and we will help.`],
];

export const SAMPLES = {
  confirmation: {
    label: "Entry confirmation", noQuestions: true, to: "the lifter", subject: "You're in: NESC Open 2027", entriesEmail: entries,
    preheader: "Your entry for NESC Open 2027 on 27 February 2027 is confirmed and paid.",
    why: "You are getting this email because you entered a YNEPF competition.",
    blocks: [
      ["h1", "You're in, Sam."],
      ["p", `Your entry for ${b("NESC Open 2027")} on 27 February 2027 is confirmed. Thank you for entering.`],
      ["details", [["Event", "Full power"], ["Equipment", "Classic"], ["Category", "Men's, Junior"], ["Weight class", "83 kg"], ["Federation", "Yorkshire & North East"], ["University", "Durham University"],
        ["Discount", "£20.00 off"], ["Paid", "£20.00"]], "boldLast"],
      ["note", "<b>Under 18 on the day?</b> A parent or guardian needs to be with you at the competition. We have your guardian's details already.", "info"],
      ["p", "Refunds are available until entries close on Saturday 13 February 2027, 6:00 pm. After that, we cannot refund entries."],
      ["p", "<b>Need to change something, or pull out?</b> Email us and the entries team will sort it. You cannot edit an entry yourself yet, so please get in touch before entries close."],
      ["button2", "Email us about your entry", "mailto:competitions@ynepf.co.uk?subject=Changing%20my%20entry%3A%20NESC%20Open%202027"],
      ...RULES_AND_KIT,
      ["small", "Your name, club and weight class are shown on the entries list and the lifting order. Your date of birth is never published. If anything is wrong, or you want us to change or delete what we hold about you, just reply to this email."],
    ],
  },
  liftingOrder: {
    label: "Lifting order shared", noQuestions: true, to: "every entered lifter", subject: "The provisional lifting order: NESC Open 2027", entriesEmail: entries,
    preheader: "Check your flight and session. Entry is still open, so it may change.",
    why: "You are getting this email because you are entered in this competition.",
    blocks: [
      ["h1", "The lifting order is online"],
      ["p", `Hi Sam, the provisional lifting order for ${b("NESC Open 2027")} (27 February 2027) is now online.`],
      ["button", "See the lifting order", "https://www.ynepf.co.uk/lifting/?c=nesc-open-2027"],
      ["note", "<b>This is the provisional order.</b> Entry is still open, so it may change before the competition. Please check your flight and session, and reply to this email if anything looks wrong.", "warn"],
      ...RULES_AND_KIT,
    ],
  },
  entriesClosed: {
    label: "Entries closed (automatic, when entries close)", to: "every entered lifter", subject: "Entries are now closed: NESC Open 2027", noQuestions: true, entriesEmail: entries,
    preheader: "No more changes to entries. The final lifting order will follow in the next few days.",
    why: "You are getting this email because you are entered in this competition.",
    blocks: [
      ["h1", "Entries are now closed"],
      ["p", `Hi Sam, entries for ${b("NESC Open 2027")} (27 February 2027) have now closed. Thank you for entering.`],
      ["note", "<b>There can be no more changes to entries, and we cannot offer refunds for dropouts.</b>", "warn"],
      ["p", "The final lifting order will be published in the next few days, and we will email you as soon as it is ready."],
      ["button2", "See the provisional lifting order", "https://www.ynepf.co.uk/lifting/?c=nesc-open-2027"],
      ...RULES_AND_KIT,
    ],
  },
  liftingFinal: {
    label: "Final lifting order (when the entries team marks it final)", to: "every entered lifter", subject: "The final lifting order: NESC Open 2027", noQuestions: true, entriesEmail: entries,
    preheader: "The final lifting order is online. Please check your flight and session.",
    why: "You are getting this email because you are entered in this competition.",
    blocks: [
      ["h1", "The final lifting order is here"],
      ["p", `Hi Sam, the final lifting order for ${b("NESC Open 2027")} (27 February 2027) is now online.`],
      ["button", "See the final lifting order", "https://www.ynepf.co.uk/lifting/?c=nesc-open-2027"],
      ["note", "<b>This is the final order.</b> Entries have closed. Please check your flight and session, and reply to this email straight away if anything looks wrong.", "warn"],
      ...RULES_AND_KIT,
    ],
  },
  priority: {
    label: "Priority entry link", to: "a volunteer", subject: "Your priority entry link: NESC Open 2027", entriesEmail: entries,
    preheader: "Enter NESC Open 2027 early, before general entry opens. Your link works once.",
    why: "You are getting this email because you asked for a priority entry link.",
    blocks: [
      ["h1", "Enter early with priority access"],
      ["p", `Hi Alex, thank you for volunteering. You can enter ${b("NESC Open 2027")} (27 February 2027) before general entry opens.`],
      ["button", "Enter with priority", "https://www.ynepf.co.uk/enter?c=nesc-open-2027&offer=k9x2q7", "fallback"],
      ["details", [["Your link works from", "Monday 1 February 2027, 6:00 pm"], ["General entry opens", "Tuesday 2 February 2027, 6:00 pm"]]],
      ["note", "Please enter with the email address this was sent to, and keep the link to yourself. It only works once.", "warn"],
      ["p", "Priority entry costs 1 volunteer point, taken only once your entry is confirmed. If you do not use the link, you keep your point. You can still enter when general entry opens if you would rather wait."],
    ],
  },
  offer: {
    label: "Waiting list offer", to: "someone on the waiting list", subject: "A place has come up: NESC Open 2027", entriesEmail: entries,
    preheader: "A place is being held for you until Friday 12 February, 6:30 pm.",
    why: "You are getting this email because you joined the waiting list for this competition.",
    blocks: [
      ["h1", "Good news, a place has come up"],
      ["p", `A place in ${b("NESC Open 2027")} (27 February 2027) is being held for you.`],
      ["button", "Claim your place", "https://www.ynepf.co.uk/enter?c=nesc-open-2027&offer=r4m8d1", "fallback"],
      ["note", "<b>Held until Friday 12 February 2027, 6:30 pm (UK time).</b> After that it goes to the next person on the waiting list.", "warn"],
      ["small", "The link is just for you, so please do not share it. Your entry is only confirmed once you have filled in the form and paid. If you no longer want the place, you do not need to do anything."],
    ],
  },
  cancelled: {
    label: "Entry cancelled and refunded", to: "the lifter", subject: "Your entry has been cancelled: NESC Open 2027", entriesEmail: entries,
    preheader: "We have refunded £40.00 to the card you paid with.",
    why: "You are getting this email because your entry was cancelled.",
    blocks: [
      ["h1", "Your entry has been cancelled"],
      ["p", `Hi Sam, your entry in ${b("NESC Open 2027")} has been cancelled.`],
      ["details", [["Refunded", "£40.00"], ["Back on your card", "5 to 10 working days"], ["Reason", "Withdrawn at your request"]]],
      ["p", "We are sorry we will not see you on the platform this time. Keep an eye on the calendar for the next one."],
      ["button", "See upcoming competitions", "https://www.ynepf.co.uk/calendar"],
    ],
  },
  discount: {
    label: "Volunteer points discount", to: "a volunteer", subject: "Your £20 discount: NESC Open 2027", entriesEmail: entries,
    preheader: "Your discount code for NESC Open 2027. It can be used once.",
    why: "You are getting this email because you spent volunteer points.",
    blocks: [
      ["h1", "Your £20 discount"],
      ["p", `Hi Alex, here is your discount for ${b("NESC Open 2027")}. Thank you for everything you do for the federation.`],
      ["code", "VOL-7K4Q-92XD"],
      ["button", "Enter the competition", "https://www.ynepf.co.uk/enter?c=nesc-open-2027", "fallback"],
      ["details", [["Worth", "£20.00 (4 points)"], ["Use by", "Saturday 13 February 2027"], ["How", "Type the code into the discount box, using this email address"]]],
      ["small", "It can be used once. The points are only taken from your balance when your entry is confirmed."],
    ],
  },
  otp: {
    label: "One-time points code", to: "a volunteer", subject: "Your volunteer points code", entriesEmail: entries,
    preheader: "Your one-time code is 482 913. It works for 15 minutes.",
    why: "You are getting this email because someone asked to look at volunteer points for this address.",
    blocks: [
      ["h1", "Your one-time code"],
      ["p", "Use this code to look at and spend your volunteer points. It works for 15 minutes and can be used once."],
      ["code", "482 913"],
      ["small", "Did not ask for this? You can ignore this email. Nothing has changed."],
    ],
  },

  // ---- the rest of the emails to lifters and volunteers --------------------------------------------------------
  joined: {
    label: "Waiting list: joined", to: "someone joining a full competition's list", subject: "You are on the waiting list: NESC Open 2027", entriesEmail: entries,
    preheader: "You are number 3 in the queue. You do not need to do anything now.",
    why: "You are getting this email because you joined the waiting list for this competition.",
    blocks: [
      ["h1", "You're on the waiting list"],
      ["p", `Hi Sam, ${b("NESC Open 2027")} (27 February 2027) is full at the moment, so we have put you on the waiting list.`],
      ["details", [["Your place in the queue", "3"], ["Time to take a place", "48 hours"]]],
      ["p", "If a place becomes free, we will email you a personal link and you will have 48 hours to use it. You do not need to do anything now."],
      ["small", "If you no longer want a place, you can ignore any email we send you and the place will pass to the next person."],
    ],
  },
  reminder: {
    label: "Waiting list: reminder", to: "someone with an offer about to run out", subject: "Reminder: your place is held until Friday 12 February 2027, 6:30 pm", entriesEmail: entries,
    preheader: "Your place in NESC Open 2027 runs out soon.",
    why: "You are getting this email because a place is being held for you.",
    blocks: [
      ["h1", "Your place runs out soon"],
      ["p", `Hi Sam, a quick reminder: the place we are holding for you in ${b("NESC Open 2027")} runs out on <b>Friday 12 February 2027, 6:30 pm</b> (UK time).`],
      ["note", "To enter, use the personal link in our earlier email, <b>\"A place has come up\"</b>. If you no longer want the place, you do not need to do anything and it will pass to the next person.", "warn"],
    ],
  },
  expired: {
    label: "Waiting list: expired", to: "someone who did not take their place in time", subject: "Your place has gone to the next person: NESC Open 2027", entriesEmail: entries,
    preheader: "You can join the waiting list again if you still want to enter.",
    why: "You are getting this email because the place held for you ran out.",
    blocks: [
      ["h1", "Your place has gone to the next person"],
      ["p", `Hi Sam, the place we were holding for you in ${b("NESC Open 2027")} was not taken up in time, so it has gone to the next person on the waiting list.`],
      ["p", "If you still want to enter, you can join the waiting list again. You will go to the back of the queue."],
      ["button", "Join the waiting list again", "https://www.ynepf.co.uk/enter?c=nesc-open-2027"],
    ],
  },
  volunteerSignup: {
    label: "Volunteer sign-up (also used when answers change)", to: "a volunteer", subject: "You are signed up to volunteer: NESC Open 2027", entriesEmail: entries,
    preheader: "Thank you for signing up. Here is what you said you could help with.",
    why: "You are getting this email because you signed up to volunteer.",
    blocks: [
      ["h1", "Thank you for volunteering"],
      ["p", `Hi Alex, thank you for signing up to volunteer at ${b("NESC Open 2027")} (27 February 2027). You said you could help with:`],
      ["bullets", ["Saturday, session 1: Table, MC", "Saturday, session 2: Table"]],
      ["p", "We will be in touch about the rota."],
      ["note", "If you are given a role and your plans change, please tell us in advance. If you do not turn up and have not told us, you lose your volunteer points.", "warn"],
      ["p", "Need to change what you said you can do? Use your personal link. Please keep it to yourself."],
      ["button", "Change your answers", "https://www.ynepf.co.uk/volunteer?c=nesc-open-2027&edit=t5p3w8", "fallback"],
    ],
  },
  volunteerLink: {
    label: "Volunteer personal link", to: "a volunteer who asked for it", subject: "Your volunteer link: NESC Open 2027", entriesEmail: entries,
    preheader: "Your personal link to see and change your volunteer answers.",
    why: "You are getting this email because someone asked for your volunteer link.",
    blocks: [
      ["h1", "Your volunteer link"],
      ["p", `Hi Alex, here is your personal link to see and change your volunteer answers for ${b("NESC Open 2027")}.`],
      ["button", "See or change your answers", "https://www.ynepf.co.uk/volunteer?c=nesc-open-2027&edit=t5p3w8", "fallback"],
      ["small", "Did not ask for this? You can ignore this email."],
    ],
  },
  refundPartial: {
    label: "Part refund (entry team or Stripe dashboard; a full refund uses the cancelled email)", to: "the lifter", subject: "A refund for your entry: NESC Open 2027", entriesEmail: entries,
    preheader: "We have refunded £10.00. You are still entered.",
    why: "You are getting this email because part of your entry fee was refunded.",
    blocks: [
      ["h1", "We have refunded part of your entry"],
      ["p", `Hi Sam, we have refunded part of your entry fee for ${b("NESC Open 2027")}. <b>You are still entered.</b>`],
      ["details", [["Refunded", "£10.00"], ["Back on your card", "5 to 10 working days"], ["Reason", "Entered as bench only, charged full power"]]],
    ],
  },
  autoRefund: {
    label: "Automatic refund (paid after the place was released)", to: "the lifter", subject: "Your payment for NESC Open 2027 has been refunded", entriesEmail: entries,
    preheader: "Your place was released before your payment arrived, so we have refunded you in full.",
    why: "You are getting this email because your payment was refunded automatically.",
    blocks: [
      ["h1", "We have refunded your payment"],
      ["p", `Hi Sam, sorry: your payment arrived after your place was released, and ${b("NESC Open 2027")} has since filled. We have refunded you in full.`],
      ["details", [["Refunded", "£40.00"], ["Back on your account", "a few days"]]],
      ["p", "You can join the waiting list on the competition page."],
      ["button", "Join the waiting list", "https://www.ynepf.co.uk/enter?c=nesc-open-2027"],
    ],
  },
  rota: {
    label: "Rota published (new email)", noQuestions: true, to: "each volunteer with a role", subject: "The rota is published: NESC Open 2027", entriesEmail: entries,
    preheader: "Here is what you are doing at NESC Open 2027, and when.",
    why: "You are getting this email because you volunteered and have a role on the rota.",
    blocks: [
      ["h1", "The rota is published"],
      ["p", `Hi Alex, the rota for ${b("NESC Open 2027")} (27 February 2027) is now live. Thank you for helping. This is what you are doing:`],
      ["details", [["Saturday, session 1", "Table"], ["Saturday, session 2", "MC"]]],
      ["button", "See the full rota", "https://www.ynepf.co.uk/rota?c=nesc-open-2027"],
      ["note", "<b>If your plans change, please tell us in advance.</b> If you do not turn up and have not told us, you lose your volunteer points. If you tell us beforehand, it costs you nothing.", "warn"],
      ["p", "Please arrive in good time before your session starts. If anything looks wrong, reply to this email."],
    ],
  },

  // ---- internal notes to the competitions inbox -----------------------------------------------------------------
  inNewEntry: {
    group: "Internal notes (to the competitions inbox)", internal: true, label: "New entry", to: "competitions inbox", subject: "New entry: Sam Taylor, NESC Open 2027",
    preheader: "Sam Taylor has entered NESC Open 2027. 41 of 96 places taken.",
    blocks: [
      ["h1", "New entry"],
      ["p", `${b("Sam Taylor")} has entered ${b("NESC Open 2027")} (27 February 2027).`],
      ["details", [["Event", "Full power, classic"], ["Weight class", "Men's 83 kg"], ["Category", "Junior"], ["Federation", "Scotland (a guest)"], ["University", "Durham University"], ["Paid", "£20.00 (after a discount of £20.00)"], ["Extra", "Photo package, £10.00"], ["OpenIPF", "https://www.openipf.org/u/samtaylor"], ["Email", "sam@example.com"]]],
      ["note", "<b>A guest:</b> the membership number needs checking. Under 18 on the day: parent or guardian details were taken.", "warn"],
      ["p", "That is 41 of 96 places taken."],
      ["button", "Open the entries desk", "https://www.ynepf.co.uk/admin/#competitions/abc/entries"],
    ],
  },
  inDiscountUsed: {
    group: "Internal notes (to the competitions inbox)", internal: true, label: "Discount code used", to: "competitions inbox", subject: "Discount code used: SAM-20OFF-K7XQ2M, Sam Taylor",
    preheader: "The code was used for NESC Open 2027.",
    blocks: [
      ["h1", "A discount code was used"],
      ["p", `The code ${b("SAM-20OFF-K7XQ2M")} has been used for ${b("NESC Open 2027")}.`],
      ["details", [["Used by", "Sam Taylor (sam@example.com)"], ["Discount", "£20.00 off, so they paid £20.00"], ["Made for", "Sam Taylor, sam@example.com"], ["Reason", "Volunteer thank-you"]]],
      ["button", "See every use of the codes", "https://www.ynepf.co.uk/admin/#competitions/abc/discounts"],
    ],
  },
  inRefund: {
    group: "Internal notes (to the competitions inbox)", internal: true, label: "Refund or cancellation", to: "competitions inbox", subject: "Refund: £40.00, Sam Taylor, NESC Open 2027",
    preheader: "Ed refunded £40.00 to Sam Taylor. The place is free again.",
    blocks: [
      ["h1", "Entry cancelled and refunded"],
      ["p", `${b("Ed")} refunded ${b("£40.00")} to Sam Taylor for their entry in ${b("NESC Open 2027")}.`],
      ["details", [["Reason", "Withdrawn at their request"], ["The entry is now", "Cancelled, and the place is free"], ["Email", "sam@example.com"], ["Places taken", "40 of 96"]]],
      ["small", "Stripe keeps its processing fee on a refund."],
      ["button", "Open the entries desk", "https://www.ynepf.co.uk/admin/#competitions/abc/entries"],
    ],
  },
  inPrioritySent: {
    group: "Internal notes (to the competitions inbox)", internal: true, label: "Priority links sent", to: "competitions inbox", subject: "Priority entry links sent: NESC Open 2027",
    preheader: "Sent to 3 people. 1 could not be sent and will be tried again.",
    blocks: [
      ["h1", "Priority links sent"],
      ["p", `Priority entry links for ${b("NESC Open 2027")} have been emailed to 3 people:`],
      ["bullets", ["Alex Morgan <alex@example.com>", "Priya Shah <priya@example.com>", "Tom Reid <tom@example.com>"]],
      ["note", "Could not be sent to 1 (they will be tried again at the next check): Jo Blake <jo@example.com>", "warn"],
      ["button", "See who has used a link", "https://www.ynepf.co.uk/admin/#competitions/abc/discounts"],
    ],
  },
  inOffered: {
    group: "Internal notes (to the competitions inbox)", internal: true, label: "Waiting list place offered", to: "competitions inbox", subject: "Offered a place: Jo Blake (NESC Open 2027)",
    preheader: "Jo Blake has until Friday 12 February 2027, 6:30 pm to take the place.",
    blocks: [
      ["h1", "A place was offered"],
      ["p", `A place in ${b("NESC Open 2027")} was offered to ${b("Jo Blake")} (jo@example.com) from the waiting list. They have until <b>Friday 12 February 2027, 6:30 pm</b>.`],
    ],
  },
  inVolunteer: {
    group: "Internal notes (to the competitions inbox)", internal: true, label: "New volunteer (or changed answers)", to: "competitions inbox", subject: "New volunteer: Alex Morgan, NESC Open 2027",
    preheader: "Alex Morgan has signed up to volunteer.",
    blocks: [
      ["h1", "New volunteer"],
      ["p", `A new volunteer has signed up for ${b("NESC Open 2027")}.`],
      ["details", [["Name", "Alex Morgan"], ["Email", "alex@example.com"]]],
      ["bullets", ["Saturday, session 1: Table, MC", "Saturday, session 2: Table"]],
      ["button", "Open the rota", "https://www.ynepf.co.uk/admin/#competitions/abc/volunteers"],
    ],
  },
  inPointsSpent: {
    group: "Internal notes (to the competitions inbox)", internal: true, label: "Volunteer points spent", to: "competitions inbox", subject: "Volunteer points spent: Alex Morgan",
    preheader: "Alex Morgan turned 4 points into a £20 discount code.",
    blocks: [
      ["h1", "Points turned into a discount"],
      ["p", `${b("Alex Morgan")} (alex@example.com) turned 4 volunteer points into a £20 discount code for ${b("NESC Open 2027")}.`],
      ["details", [["Code", "VOL-7K4Q-92XD"]]],
      ["small", "The points come off their balance when an entry using the code is confirmed."],
      ["button", "Discount codes and who has used them", "https://www.ynepf.co.uk/admin/#competitions"],
    ],
  },
  inPointsBack: {
    group: "Internal notes (to the competitions inbox)", internal: true, label: "Discount code given back", to: "competitions inbox", subject: "Discount code given back: alex@example.com",
    preheader: "An unused code was switched off. Its 4 points are free to spend again.",
    blocks: [
      ["h1", "A discount code was given back"],
      ["p", `Alex Morgan (alex@example.com) gave back an unused discount code for ${b("NESC Open 2027")}, so its 4 points are free to spend again.`],
      ["details", [["Code switched off", "VOL-7K4Q-92XD"]]],
      ["small", "No points were spent or added: an unused code only holds its points."],
      ["button", "Discount codes", "https://www.ynepf.co.uk/admin/#competitions"],
    ],
  },
  inCommittee: {
    group: "Internal notes (to the competitions inbox)", internal: true, label: "Committee points awarded", to: "competitions inbox", subject: "Committee points awarded",
    preheader: "3 points each for 4 people, for the quarter ending 31 December 2026.",
    blocks: [
      ["h1", "Committee points awarded"],
      ["p", "Committee and executive points have been awarded: 3 points each, for being part of the committee on the last day of the quarter."],
      ["h2", "Q4 2026: 4 people"],
      ["bullets", ["Ed Hart <ed@example.com>", "Maya Singh <maya@example.com>", "Dan Cole <dan@example.com>", "Lou Perry <lou@example.com>"]],
      ["button", "See the points list", "https://www.ynepf.co.uk/admin/#points"],
    ],
  },
  inLiftingShared: {
    group: "Internal notes (to the competitions inbox)", internal: true, label: "Lifting order shared", to: "competitions inbox", subject: "Lifting order shared: NESC Open 2027",
    preheader: "The provisional lifting order was emailed to 41 lifters.",
    blocks: [
      ["h1", "Lifting order shared"],
      ["p", `The provisional lifting order for ${b("NESC Open 2027")} was emailed to <b>41 lifters</b>.`],
      ["button", "See the lifting order", "https://www.ynepf.co.uk/lifting/?c=nesc-open-2027"],
    ],
  },

  // ---- the contact form ------------------------------------------------------------------------------------------
  contact: {
    group: "Contact form", internal: true, label: "Message from the website contact form", to: "info@ynepf.co.uk", subject: "[Website] Can my under-18 son enter?",
    preheader: "A message from Pat Jones through the contact form on the website.",
    why: "Sent through the contact form on the YNEPF website. Replying goes to the sender.",
    blocks: [
      ["h1", "A message from the website"],
      ["details", [["From", "Pat Jones"], ["Email", "pat@example.com"], ["Subject", "Can my under-18 son enter?"]]],
      ["quote", "Hi,\n\nMy son is 16 and has been training for a year. Can he enter the NESC Open, and do I need to be there on the day?\n\nThanks,\nPat"],
      ["button", "Reply to Pat", "mailto:pat@example.com?subject=Re%3A%20Can%20my%20under-18%20son%20enter%3F"],
    ],
  },
};
