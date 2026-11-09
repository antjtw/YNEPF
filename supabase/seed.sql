-- Seed content, generated from the original hand-written pages.
-- Safe to run once: each block only inserts if its table is empty.

-- Organisation
do $seed$ begin
if not exists (select 1 from public.org_sections) then
with s as (insert into public.org_sections (title, description, sort_order) values ($q$Executive team$q$, $q$The Executive Team sets the direction for the division and leads its day-to-day running.$q$, 10) returning id)
insert into public.people (section_id, name, role, instagram, blurb, sort_order) values
((select id from s), $q$Ant White$q$, $q$Chair Person$q$, $q$shred.kemper$q$, $q$Leads the division's strategy, governance and links with British Powerlifting and beyond. The safeguarding lead at the top level.$q$, 10),
((select id from s), $q$Matt Dempsey$q$, $q$Competition & Operations Director$q$, $q$dempseyleeds$q$, $q$Sets up competitions and runs the calendar. Oversees health, safety and safeguarding at events, and works with venues and host clubs.$q$, 20),
((select id from s), $q$Jo Frost$q$, $q$Technical & Compliance Director$q$, $q$jttfrost71$q$, $q$Assigns referees, upholds refereeing standards and anti-doping compliance, and runs referee courses for the division.$q$, 30),
((select id from s), $q$Gemma Gibson$q$, $q$Finance Director$q$, $q$gemmasgibson$q$, $q$Manages the division's accounts, fees, invoices and sponsorship, and oversees merchandise finances.$q$, 40),
((select id from s), $q$Tarrin Wilson$q$, $q$Growth & Strategy Director$q$, $q$Tarrinwilson$q$, $q$Leads media, social media, the website and livestreams, plus merchandise, sponsorship and outreach to juniors and universities.$q$, 50);
with s as (insert into public.org_sections (title, description, sort_order) values ($q$Supporting committee$q$, $q$The Supporting Committee delivers the work behind our competitions, reporting to the directors.$q$, 20) returning id)
insert into public.people (section_id, name, role, instagram, blurb, sort_order) values
((select id from s), $q$Ed Butcher$q$, $q$Junior Development Officer$q$, $q$butcher__edward$q$, $q$Builds the junior pathway, links with schools and universities, and supports competitions and coaching for younger lifters.$q$, 10),
((select id from s), $q$Will Butcher$q$, $q$Technology Officer$q$, $q$willbutcherphotography$q$, $q$Improves the tech, systems and tools the division relies on, and runs the competition livestream setup.$q$, 20),
((select id from s), $q$Ben Gibson$q$, $q$Health & Safety Officer$q$, $q$bigbengibson$q$, $q$Runs risk assessments, keeps our health and safety policies up to date, and makes sure first aid cover is in place at every event.$q$, 30),
((select id from s), $q$Matthew Gill$q$, $q$Equipped Development Officer$q$, $q$matthewgill.coach$q$, $q$Champions equipped lifting in the division, running workshops and taster sessions and looking after division-owned equipped kit.$q$, 40),
((select id from s), $q$Karen Horwood$q$, $q$Records Registrar$q$, $q$karen1423178$q$, $q$Keeps the divisional records up to date, verifies and certifies new records, and publishes them for everyone to see.$q$, 50),
((select id from s), $q$Andrew Kearsey$q$, $q$Equipment Officer$q$, $q$mrkearsey$q$, $q$Keeps a register of all federation equipment, sources and maintains it, and makes sure it meets IPF standards.$q$, 60),
((select id from s), $q$Sabrina Labuhn$q$, $q$Entries Coordinator$q$, $q$sabs_labuhn$q$, $q$Sets up competition entries, handles refunds and changes, plans lifting orders, and reports results to OpenIPF.$q$, 70),
((select id from s), $q$Gigi Nicolson$q$, $q$Volunteer Coordinator$q$, $q$xgigi_n$q$, $q$Recruits and assigns volunteers, plans the rotas, and runs the volunteer points system across all competitions.$q$, 80),
((select id from s), $q$Rachel Steedman$q$, $q$Equipped Development Officer$q$, $q$steedmanrachel8$q$, $q$Champions equipped lifting in the division, running workshops and taster sessions and looking after division-owned equipped kit.$q$, 90);
with s as (insert into public.org_sections (title, description, sort_order) values ($q$International referees$q$, $q$IPF referees who can officiate at all levels of competition, from a Novice to the IPF World Championships.$q$, 30) returning id)
insert into public.people (section_id, name, role, instagram, blurb, sort_order) values
((select id from s), $q$Carole Springett$q$, $q$IPF Category I$q$, $q$carole7582$q$, $q$$q$, 10),
((select id from s), $q$Jo Frost$q$, $q$IPF Category I$q$, $q$jttfrost71$q$, $q$$q$, 20),
((select id from s), $q$Jacqui Rees$q$, $q$IPF Category I$q$, $q$jacquivrees$q$, $q$$q$, 30),
((select id from s), $q$Phil Frost$q$, $q$IPF Category I$q$, $q$fr03tay$q$, $q$$q$, 40),
((select id from s), $q$Ant White$q$, $q$IPF Category II$q$, $q$shred.kemper$q$, $q$$q$, 50);
with s as (insert into public.org_sections (title, description, sort_order) values ($q$National referees$q$, $q$Nationally qualified referees who can lead national competitions as Chief Referee and Jury members.$q$, 40) returning id)
insert into public.people (section_id, name, role, instagram, blurb, sort_order) values
((select id from s), $q$Richard Caine$q$, $q$Senior National Referee$q$, $q$squstbenchdead$q$, $q$$q$, 10),
((select id from s), $q$Caitlin Baxter$q$, $q$National Referee$q$, $q$twoplatecait$q$, $q$$q$, 20),
((select id from s), $q$Ed Butcher$q$, $q$National Referee$q$, $q$butcher__edward$q$, $q$$q$, 30),
((select id from s), $q$Sam Butler$q$, $q$National Referee$q$, $q$samcad93$q$, $q$$q$, 40),
((select id from s), $q$Ben Gibson$q$, $q$National Referee$q$, $q$bigbengibson$q$, $q$$q$, 50),
((select id from s), $q$Hollie Johnson$q$, $q$National Referee$q$, $q$hj_strengthcoaching$q$, $q$$q$, 60),
((select id from s), $q$Alex Macaulay$q$, $q$National Referee$q$, $q$itsalexmacaulay$q$, $q$$q$, 70),
((select id from s), $q$Elspeth McLeod$q$, $q$National Referee$q$, $q$elspethmcleod$q$, $q$$q$, 80),
((select id from s), $q$Gigi Nicolson$q$, $q$National Referee$q$, $q$xgigi_n$q$, $q$$q$, 90),
((select id from s), $q$Carole O'Neil$q$, $q$National Referee$q$, $q$caroleoneil$q$, $q$$q$, 100),
((select id from s), $q$Tarrin Wilson$q$, $q$National Referee$q$, $q$Tarrinwilson$q$, $q$$q$, 110);
end if;
end $seed$;

-- FAQs
do $seed$ begin
if not exists (select 1 from public.faq_categories) then
with c as (insert into public.faq_categories (title, sort_order) values ($q$Before you enter$q$, 10) returning id)
insert into public.faqs (category_id, question, answer_md, sort_order) values
((select id from c), $q$Do I need a membership to compete?$q$, $q$Yes. You must be a member of British Powerlifting to lift at our competitions. [Buy a membership on the British Powerlifting website](https://www.britishpowerlifting.org/membership/).

Bring proof of your membership to weigh-in. You can show it as a PDF, an image, a Digital Wallet card, or a printed copy. If you cannot show it, you will not be allowed to lift.

You also need photo ID, such as a driving licence or passport. A photo of it is fine. For Sub-Junior lifters, a birth certificate is also accepted.$q$, 10),
((select id from c), $q$Who can enter a competition?$q$, $q$Anyone can enter, from your first competition to your hundredth. You do need to be able to lift the bar and collars, which weigh 25 kg together, so your opening attempt in each lift must be at least 25 kg.

The only other exception is a competition that needs a qualifying total. If that applies, we say so clearly in the competition details.$q$, 20),
((select id from c), $q$Can I compete with YNEPF if I have competed in a non-IPF event?$q$, $q$Possibly. Under IPF by-law 15.8, anyone who takes part in an event run by a body that is not recognised by the World Anti-Doping Agency (WADA) becomes ineligible for authorised **National or International** competitions for 12 months from that event.

Our competitions are divisional, which sits below national level, so this restriction does not automatically rule you out of a YNEPF competition. If you have competed in a non-IPF event and are unsure where you stand, email us at [ynepfentries@gmail.com](mailto:ynepfentries@gmail.com) before you enter and we will check for you.$q$, 30),
((select id from c), $q$What kit am I allowed to use?$q$, $q$You may only use kit from the [IPF Approved Kit List](https://www.powerlifting.sport/rules/codes/info/approved-list). Anything not on that list is not allowed. Lifting straps are not allowed.

Chalk is provided on the day. Liquid chalk is not allowed.$q$, 40),
((select id from c), $q$What equipment will be on the platform?$q$, $q$On the competition platform we use an Eleiko rack with a soft-pad bench, and Eleiko bars. At franchise competitions, run by clubs rather than the Federation, other IPF-approved racks, bars, plates or collars may be used.

In the warm-up area, every venue has adjustable racks, power bars and calibrated plates.$q$, 50);
with c as (insert into public.faq_categories (title, sort_order) values ($q$Entry, changes and refunds$q$, 20) returning id)
insert into public.faqs (category_id, question, answer_md, sort_order) values
((select id from c), $q$How do I find out when entries open?$q$, $q$We post the dates and times for priority, general and guest entry on our social media channels. Watch those for the entry link.$q$, 10),
((select id from c), $q$Can I change or cancel my entry?$q$, $q$You can change or cancel up to the date in the competition details. This is usually the Saturday three weeks before the competition. There are no exceptions.$q$, 20),
((select id from c), $q$Can I get a refund?$q$, $q$Once entry closes, we cannot make changes or give refunds if you pull out. Entries cannot be moved to another event.

If you pre-ordered a media package and then pull out, we will refund that.$q$, 30),
((select id from c), $q$I am a guest lifter. What does that mean?$q$, $q$Guest lifters can enter one week after general entry, if spaces are left. As a guest you are not eligible to win, to place, or to set divisional records. You can still set a qualifying total for national competitions, in the weight class you lift in on the day.$q$, 40),
((select id from c), $q$When can I see the lifting order?$q$, $q$We put the lifting order together once entries reach around 80% of capacity, or when entries slow down, or when the competition is full.

We send it out by email as soon as we can. At the latest, this will be shortly after entries close, around three weeks before the competition.

If you have not received the email, check your spam or junk folder, or contact us at [ynepfentries@gmail.com](mailto:ynepfentries@gmail.com). The lifting order is also always on our [Linktree](https://linktr.ee/ynepf), so you can check there too.$q$, 50),
((select id from c), $q$Can I request which day to lift on at a multi-day competition?$q$, $q$No. The lifting order flexes around how many lifters we have, which we try to balance across the competition days. If we accommodated one lifter's preference, we would have to accommodate everyone's.

Please keep both competition days free.$q$, 60),
((select id from c), $q$How do I claim a discount?$q$, $q$If you have volunteer points to spend, you can claim a discount from us by email. Please do this at least 24 hours before entry opens. Email [ynepfentries@gmail.com](mailto:ynepfentries@gmail.com).

Discount codes are non-transferable. Any lifter who uses a discount code without authorisation will be refunded and refused entry.$q$, 70);
with c as (insert into public.faq_categories (title, sort_order) values ($q$Volunteering, points and discounts$q$, 30) returning id)
insert into public.faqs (category_id, question, answer_md, sort_order) values
((select id from c), $q$Can I volunteer at a competition?$q$, $q$Yes, and we would love your help. Volunteers take on roles such as setting up, taking down, platform crew, the table team and MC. You do not need any experience for these, and we give every volunteer a full briefing before you start.

Refereeing is different. Referees must pass a divisional referees exam, which we host periodically when there is enough interest. Keep an eye on our social media for dates, or [register your interest here](https://forms.gle/3N9eVSnGBKtuUHB27).

When you volunteer, you earn points you can spend on future competitions. Scotland and Wales already run this approach, letting volunteers earn priority access and discounts on competitions and memberships.$q$, 10),
((select id from c), $q$Can under-18s volunteer?$q$, $q$No. You must be 18 or over to volunteer at our competitions. This is for safeguarding reasons.

Under-18s are very welcome to compete, and to come along and watch.$q$, 20),
((select id from c), $q$How do I earn points?$q$, $q$Points are based on the role and how long you give:

- Set up or take down: 1 point each
- Set up and take down: 2 points total
- Session role (refereeing, platform crew, table team, MC): 1 point
- Ad hoc volunteering, outside competition: 1 to 3 points, decided by the committee based on the size of the task

Points stack. Volunteer for two sessions and you earn 4 points.

Executive and committee members receive 3 points for each quarter of service after 6 months, awarded from that point.

You can bank points for 24 months. After that, they expire 24 months after being earned.$q$, 30),
((select id from c), $q$How do I spend points?$q$, $q$You can spend points in several ways, from early access to entries through to a free British Powerlifting membership:

- Priority entry: 1 point
- £20 off competition entry: 4 points
- £20 off, with priority entry: 5 points
- £40 off competition entry: 8 points
- £40 off, with priority entry: 9 points
- Half-price BP membership: 5 points
- Free BP membership: 10 points

Here is how each one works:

- Priority entry: links are emailed to all volunteers 24 hours before general entry opens. Do not pass your link on to anyone else.
- Entry discounts: issued as a code on request by email. Email [ynepfentries@gmail.com](mailto:ynepfentries@gmail.com) at least 24 hours before general entry. Codes are for you only and cannot be added after you have paid.
- Memberships: refunded in part or in full on request by email, with proof of purchase.

We are also looking at gift cards and discount codes with our federation partners.$q$, 40),
((select id from c), $q$How do I check my points?$q$, $q$Your points are kept up to date on our rewards tracker. [View the points tracker](https://docs.google.com/spreadsheets/u/1/d/e/2PACX-1vSEGYi0fHlW-MkpaUNuISwz-DWoXezIMDo352dkZfRcUTjzvmyZJtRFgxlydJh4qc1Yqy3tb1tr7gde/pubhtml?gid=825507740&single=true).$q$, 50);
with c as (insert into public.faq_categories (title, sort_order) values ($q$YNE Worlds$q$, 40) returning id)
insert into public.faqs (category_id, question, answer_md, sort_order) values
((select id from c), $q$What is YNE Worlds?$q$, $q$YNE Worlds is our divisional championship, held in the November Open slot. With new restrictions at the Open British Championships, it gives our lifters a prestigious platform of their own. To keep the standard high and manage demand, there is a qualifying process.$q$, 10),
((select id from c), $q$How do I qualify for YNE Worlds?$q$, $q$There are two ways to qualify:

- Achieve a minimum of 70 GLP, at or after the Nov Open 2025, or
- Win Best Lifter at YNE Worlds 2025.

GLP (GL points) is a score that adjusts your total for your bodyweight. All age classes must meet 70 GLP. The qualifying total must have been achieved within the 12 months before the competition.$q$, 20),
((select id from c), $q$Do I need to qualify in the weight class I will compete in?$q$, $q$No. As long as you achieved 70 GLP in the 12 months beforehand, in any weight class, you are good to enter. You do not have to hit the score in the same class you compete in on the day.$q$, 30),
((select id from c), $q$Can equipped lifters enter YNE Worlds?$q$, $q$Yes. Equipped lifters who reach 70 GLP are welcome to enter and place within their category. They cannot compete for the Best Lifter award. This competition does not offer bench-only entries.$q$, 40);
with c as (insert into public.faq_categories (title, sort_order) values ($q$Cost$q$, 50) returning id)
insert into public.faqs (category_id, question, answer_md, sort_order) values
((select id from c), $q$How much does it cost to enter?$q$, $q$Our 2026 entry fees are:

| Type | Fee |
| --- | --- |
| Full power | £40 |
| Bench-only | £25 |
| Sub-junior | £15 |

We raised our fees for 2026 to bring us in line with other divisions, and to help us run a cleaner, fairer sport. The fee lets us keep drug testing at our competitions and reward our volunteers with entry discounts for their time.$q$, 10);
with c as (insert into public.faq_categories (title, sort_order) values ($q$Photos and media$q$, 60) returning id)
insert into public.faqs (category_id, question, answer_md, sort_order) values
((select id from c), $q$How do I get photos of my lifting?$q$, $q$Our competition photos are taken by White Lights Media. You can order your photos from their website: [whitelightsmediaregionals.com](https://whitelightsmediaregionals.com/).

There is a pre-order discount if you buy your photos at the same time as your entry.

Photos are supplied by White Lights Media, not by YNEPF. They usually aim to deliver media packages within two weeks.$q$, 10),
((select id from c), $q$Can I opt out of my photos being used?$q$, $q$Yes. We take photos and videos at our competitions and may use them to promote the sport and the division, for example on our social media and website.

When you enter, you can opt out of your photos and videos being used this way. You can change your choice at any time by emailing [ynepfentries@gmail.com](mailto:ynepfentries@gmail.com).$q$, 20);
with c as (insert into public.faq_categories (title, sort_order) values ($q$On the day$q$, 70) returning id)
insert into public.faqs (category_id, question, answer_md, sort_order) values
((select id from c), $q$When and how does weigh-in work?$q$, $q$Weigh-in is on competition day, two hours before your flight starts. Try to arrive as it opens, or a little earlier. Some competitions call you in lot-number order. If you miss your turn, you wait until everyone else has weighed in.

Weigh-in is single sex and private. At weigh-in we ask for your BP membership, your photo ID, and your openers (your first weight in each lift).$q$, 10),
((select id from c), $q$What happens if I do not make my weight?$q$, $q$If you are over your category weight, you can try again later in the weigh-in period. You can have as many tries as you like while weigh-in is open.

If you still do not make weight, you lift as a guest. You will not be eligible to win, to place, or to set divisional records. You can still set a qualifying total for national competitions, in the weight class you lift in on the day. You start in the flight you were first given.$q$, 20),
((select id from c), $q$When do I set my rack heights and check my kit?$q$, $q$You set your squat and bench rack and safety heights after weigh-in, before the competition starts. Wear the shoes you will compete in when you set them.

Kit check happens at the same time as weigh-in, and closes when weigh-in closes. It is advisable to weigh in before you get your kit checked. If both sexes are weighing in, you can get your kit checked while the other sex weighs in.

Anything you will or may wear on the platform must be shown and passed at kit check. This includes borrowed or shared kit. If you go to the platform with an item that was not checked, you will be asked to remove or replace it, and your one-minute attempt timer may run out while you do. Always get everything checked, even if you are unsure.$q$, 30),
((select id from c), $q$Are your competitions drug tested?$q$, $q$Yes. We are a drug-tested federation. Testing started at the Nov Open 2025, and we are working towards testing at every competition in 2026. Testing is carried out under UK Anti-Doping rules.$q$, 40),
((select id from c), $q$Can I bring a coach or handler?$q$, $q$Yes. You do not need a membership to coach. You can have one coach or handler in the warm-up area. Sub-Junior lifters can have two.

Coaches get a wristband at weigh-in and must wear it at all times. Anyone in the warm-up area without a wristband will be asked to return to the audience.$q$, 50),
((select id from c), $q$Can people come and watch?$q$, $q$Yes. Spectators are very welcome. We do not charge for entry to our own competitions, though some franchise competitions, run by clubs rather than the Federation, may charge a small spectator fee to manage the crowd. If a YNEPF competition ever plans to charge, we will say so clearly. You can also watch our competitions live on [our YouTube channel](https://www.youtube.com/@YNEPF-Powerlifting).$q$, 60);
with c as (insert into public.faq_categories (title, sort_order) values ($q$Records$q$, 80) returning id)
insert into public.faqs (category_id, question, answer_md, sort_order) values
((select id from c), $q$What divisional records can I set?$q$, $q$We keep divisional records for Sub-Junior, Junior, Open and the Masters groups. We do not split Juniors down further.

You must make your category weight to set a record. Guest lifters and lifters who miss weight cannot set divisional records.$q$, 10),
((select id from c), $q$How much do I need to beat a record by?$q$, $q$You can beat a current record by as little as 0.5 kg.$q$, 20);
with c as (insert into public.faq_categories (title, sort_order) values ($q$Competition day checklist$q$, 90) returning id)
insert into public.faqs (category_id, question, answer_md, sort_order) values
((select id from c), $q$What should I pack?$q$, $q$Pack these the night before:

- Singlet and long socks
- Underwear. Any sports bra or commercial bra is fine.
- Squat shoes and deadlift shoes
- Belt, knee sleeves and wrist wraps
- A plain, round-neck cotton T-shirt with short, form-fitting sleeves that cover the shoulders
- Any warm-up kit, such as a foam roller or bands
- Your BP membership, and a pen
- Food and drink
- Talc, if you use it (chalk is provided on the platform)
- Sanitary protection, if you may need it
- A basic first aid kit (painkillers, plasters, tape, hot and cold gels, nail clippers)$q$, 10);
end if;
end $seed$;

-- Competitions
do $seed$ begin
if not exists (select 1 from public.competitions) then
insert into public.competitions (name, description, label, start_date, end_date, venue_name, capacity, entry_opens, entry_closes) values
($q$Northern Universities Championships$q$, $q$Hosted by NUPWC, the Northern Universities Championships returns.

- Entries from university alumni who graduated in summer 2025 will be accepted
- Prizes provided by sponsors$q$, $q$$q$, $q$2026-01-24$q$, $q$2026-01-25$q$, $q$Hirst Welfare Centre, Ashington$q$, 96, ($q$2025-11-29 09:00$q$::timestamp at time zone 'Europe/London'), ($q$2026-01-03 12:00$q$::timestamp at time zone 'Europe/London')),
($q$YNE March Open$q$, $q$Open to all levels of experience and strength, the YNE March Open is a qualifying competition for regional and national championships.

- Volunteers may spend points for priority entry and discounts$q$, $q$$q$, $q$2026-03-07$q$, $q$2026-03-08$q$, $q$Riccall Regen Centre, York$q$, 96, ($q$2026-01-10 09:00$q$::timestamp at time zone 'Europe/London'), ($q$2026-02-14 12:00$q$::timestamp at time zone 'Europe/London')),
($q$NESC Open$q$, $q$Hosted by the North East Strength Culture Powerlifting Club, the NESC Open returns in 2026 for its third instalment.

- Volunteers may spend points for priority entry and discounts$q$, $q$$q$, $q$2026-04-11$q$, null, $q$North East Strength Culture, Darlington$q$, 48, ($q$2026-02-14 09:00$q$::timestamp at time zone 'Europe/London'), ($q$2026-03-21 12:00$q$::timestamp at time zone 'Europe/London')),
($q$YNE Novice$q$, $q$Designed for beginners and first-time lifters, this is a chance to compete without the pressure of seasoned athletes.

- Volunteers may spend points for priority entry and discounts

**Entry requirements:** two competitions or fewer, in any federation.$q$, $q$$q$, $q$2026-06-27$q$, $q$2026-06-28$q$, $q$Riccall Regen Centre, York$q$, 96, ($q$2026-05-02 09:00$q$::timestamp at time zone 'Europe/London'), ($q$2026-06-06 12:00$q$::timestamp at time zone 'Europe/London')),
($q$Implexus Open$q$, $q$Hosted by the Implexus Gym Powerlifting Club, the Implexus Open returns in 2026 for its third instalment.

- Volunteers may spend points for priority entry and discounts

A competition shirt will be available to buy on the day. One-of-a-kind medals and best lifter trophies will be awarded. Sponsors to be announced.$q$, $q$$q$, $q$2026-07-25$q$, $q$2026-07-26$q$, $q$Implexus Gym, Leeds$q$, 96, ($q$2026-05-30 09:00$q$::timestamp at time zone 'Europe/London'), ($q$2026-07-05 12:00$q$::timestamp at time zone 'Europe/London')),
($q$YNE Juniors, Masters & Bench-Only Championships$q$, $q$Our divisional championship for Sub-Junior, Junior, Masters and bench-only athletes. An opportunity to compete against your peers.

- Volunteers may spend points for priority entry and discounts$q$, $q$$q$, $q$2026-09-12$q$, null, $q$North East Strength Culture, Darlington$q$, 64, ($q$2026-07-18 09:00$q$::timestamp at time zone 'Europe/London'), ($q$2026-08-22 12:00$q$::timestamp at time zone 'Europe/London')),
($q$Parkhead Open$q$, $q$Hosted by the historic Parkhead & Wansbeck Powersports Club, the Parkhead Open returns for its second instalment in 2026 in its recently upgraded facilities.

- Volunteers may spend points for priority entry and discounts$q$, $q$$q$, $q$2026-10-24$q$, null, $q$Hirst Welfare Centre, Ashington$q$, 48, ($q$2026-08-29 09:00$q$::timestamp at time zone 'Europe/London'), ($q$2026-10-03 12:00$q$::timestamp at time zone 'Europe/London')),
($q$YNE Worlds$q$, $q$Our divisional championship returns, where one male and one female lifter can compete for the title of YNE Worlds Champion.

- Volunteers may spend points for priority entry and discounts
- Prizes provided by sponsors

**Entry requirements:** 70 GLP achieved at or after the Nov Open 2025. [Read the qualifying process in our FAQs](faqs.html).$q$, $q$Sponsor TBD$q$, $q$2026-11-07$q$, $q$2026-11-08$q$, $q$Riccall Regen Centre$q$, 96, ($q$2026-09-12 09:00$q$::timestamp at time zone 'Europe/London'), ($q$2026-10-17 12:00$q$::timestamp at time zone 'Europe/London'));
end if;
end $seed$;

-- Records
do $seed$ begin
if not exists (select 1 from public.record_sources) then
insert into public.record_sources (title, url, sort_order) values
($q$Men's classic$q$, '', 10),
($q$Men's equipped$q$, '', 20),
($q$Women's classic$q$, '', 30),
($q$Women's equipped$q$, '', 40);
end if;
end $seed$;

-- Footer
do $seed$ begin
if not exists (select 1 from public.footer_groups) then
with g as (insert into public.footer_groups (title, placement, sort_order) values ($q$Explore$q$, $q$column$q$, 10) returning id)
insert into public.footer_links (group_id, label, url, sort_order) values
((select id from g), $q$Competition calendar$q$, $q$calendar.html$q$, 10),
((select id from g), $q$Records$q$, $q$records.html$q$, 20),
((select id from g), $q$News$q$, $q$news.html$q$, 30),
((select id from g), $q$Committee$q$, $q$committee.html$q$, 40),
((select id from g), $q$FAQs$q$, $q$faqs.html$q$, 50),
((select id from g), $q$Contact us$q$, $q$contact.html$q$, 60);
with g as (insert into public.footer_groups (title, placement, sort_order) values ($q$Competing$q$, $q$column$q$, 20) returning id)
insert into public.footer_links (group_id, label, url, sort_order) values
((select id from g), $q$Buy a membership$q$, $q$https://www.britishpowerlifting.org/membership/$q$, 10),
((select id from g), $q$Technical rules$q$, $q$https://www.powerlifting.sport/rules/codes/info/technical-rules$q$, 20),
((select id from g), $q$Approved kit$q$, $q$https://www.powerlifting.sport/rules/codes/info/approved-list$q$, 30),
((select id from g), $q$GL points calculator$q$, $q$glp-calculator.html$q$, 40);
with g as (insert into public.footer_groups (title, placement, sort_order) values ($q$Legal$q$, $q$bottom$q$, 30) returning id)
insert into public.footer_links (group_id, label, url, sort_order) values
((select id from g), $q$Privacy policy$q$, $q$#$q$, 10),
((select id from g), $q$Franchise agreements$q$, $q$#$q$, 20);
with g as (insert into public.footer_groups (title, placement, sort_order) values ($q$Social$q$, $q$social$q$, 40) returning id)
insert into public.footer_links (group_id, label, url, sort_order) values
((select id from g), $q$Linktree$q$, $q$https://linktr.ee/ynepf$q$, 10);
end if;
end $seed$;
