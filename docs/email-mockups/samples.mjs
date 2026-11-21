// Sample emails with realistic data, for the mockups. The wording here is the proposed new copy.
import { b } from "./email-template.mjs";
const entries = "competitions@ynepf.co.uk";

export const SAMPLES = {
  confirmation: {
    label: "Entry confirmation", to: "the lifter", subject: "You're in: NESC Open 2027", entriesEmail: entries,
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
      ["small", "Your name, club and weight class are shown on the entries list and the lifting order. Your date of birth is never published. If anything is wrong, or you want us to change or delete what we hold about you, just reply to this email."],
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
};
