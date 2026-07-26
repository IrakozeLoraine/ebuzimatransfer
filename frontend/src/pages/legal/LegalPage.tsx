import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/ebuzimaTransfer.svg";

/**
 * Public, unauthenticated legal page combining the Privacy Policy and the
 * End-User License Agreement (EULA) for eBuzimaTransfer.
 *
 * Routed outside ProtectedRoute so patients, referring clinicians, regulators,
 * and reviewers can read how clinical data is handled before signing in.
 * Clauses are numbered so they can be cited and walked through directly.
 *
 */

const LAST_UPDATED = "26 July 2026";
const POLICY_VERSION = "1.0";
const CONTACT_EMAIL = "l.irakoze2@alustudent.com";

const SECTIONS = [
  { id: "summary", label: "At a glance" },
  { id: "privacy", label: "Privacy Policy" },
  { id: "controller", label: "1. Who is responsible" },
  { id: "data-we-hold", label: "2. Data we hold" },
  { id: "why", label: "3. Why we process it" },
  { id: "where", label: "4. Where it is processed" },
  { id: "who-sees", label: "5. Who can see it" },
  { id: "retention", label: "6. Retention & deletion" },
  { id: "ai", label: "7. Dictation & AI summaries" },
  { id: "children", label: "8. Data about children" },
  { id: "transport", label: "9. Ambulance & driver location" },
  { id: "no-automation", label: "10. People make decisions" },
  { id: "your-rights", label: "11. Your rights" },
  { id: "security", label: "12. Security & breaches" },
  { id: "changes", label: "13. Changes to this policy" },
  { id: "eula", label: "End-User License Agreement" },
  { id: "eula-licence", label: "14. Licence & acceptable use" },
  { id: "eula-accounts", label: "15. Accounts & credentials" },
  { id: "eula-liability", label: "16. Clinical responsibility" },
  { id: "eula-termination", label: "17. Termination & governing law" },
  { id: "contact", label: "Contact" },
];

const Clause = ({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="scroll-mt-24 space-y-3">
    <h3 className="text-lg font-semibold text-foreground">{title}</h3>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      {children}
    </div>
  </section>
);

const RETENTION_ROWS: { category: string; period: string }[] = [
  {
    category: "Structured referral record",
    period:
      "Kept as part of the patient's medical record, for the period the receiving facility is required to keep clinical records under Rwandan health-record rules.",
  },
  {
    category: "Voice recording (audio)",
    period:
      "Deleted after 30 days of the referral being finalized.",
  },
  {
    category: "Transcript and generated summary",
    period:
      "Kept with the referral once a clinician has confirmed it. Discarded if the referral is cancelled before confirmation.",
  },
  {
    category: "Ambulance location history",
    period: "Deleted 30 days after the transfer is completed.",
  },
  {
    category: "Audit log entries",
    period:
      "Kept for 5 years, so that access to a referral can still be reviewed long after the transfer.",
  },
  {
    category: "Your user account",
    period:
      "Active while you work at a participating facility. Deactivated when you leave, kept 12 months for audit, then deleted.",
  },
];

export function LegalPage() {
  const location = useLocation();

  // Support deep-linking / in-page anchors (e.g. /privacy#retention).
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="eBuzimaTransfer" width={40} height={40} />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold text-foreground">
                eBuzimaTransfer
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Inter-hospital Referral Platform
              </span>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to sign in
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[240px_1fr]">
        {/* Table of contents */}
        <nav aria-label="Contents" className="hidden lg:block">
          <div className="sticky top-10 space-y-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              On this page
            </p>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {s.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Content */}
        <main className="min-w-0 space-y-10">
          <div className="space-y-3">
            <h1 className="text-2xl font-bold text-foreground">
              Privacy Policy &amp; Terms of Use
            </h1>
            <p className="text-sm text-muted-foreground">
              How eBuzimaTransfer collects, uses, and protects patient and user
              data across Rwanda's inter-hospital referral network.
            </p>
            <p className="text-xs text-muted-foreground">
              Version {POLICY_VERSION} · Last updated: {LAST_UPDATED}
            </p>
          </div>

          {/* Plain-language summary */}
          <section
            id="summary"
            className="scroll-mt-24 rounded-lg border bg-muted/40 p-5"
          >
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              At a glance
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                <strong>Nothing leaves Rwanda.</strong> The platform and every
                one of its AI features run on servers hosted in Rwanda. No
                outside company processes clinical information for us.
              </li>
              <li>
                A referral includes <strong>identifying details</strong> — the
                patient's name, date of birth, sex, and address — so the
                receiving hospital can admit the right patient.
              </li>
              <li>
                Only authenticated staff at the facilities involved in a
                referral can open it. Everyone else is refused, including staff
                at other hospitals.
              </li>
              <li>Every access and change is written to an audit log.</li>
              <li>
                Dictation and AI summaries only ever produce a draft. A
                clinician reads it, edits it, and confirms it.
              </li>
              <li>
                The system never accepts, rejects, or routes a patient on its
                own. A named person makes every decision.
              </li>
            </ul>
          </section>

          {/* ── Privacy Policy ── */}
          <div id="privacy" className="scroll-mt-24 space-y-8">
            <h2 className="border-b pb-2 text-xl font-bold text-foreground">
              Privacy Policy
            </h2>

            <Clause id="controller" title="1. Who is responsible for this data">
              <p>
                eBuzimaTransfer is currently operated as an academic project by
                Loraine Mukezwa Irakoze (African Leadership University), who acts
                as data controller. That is a deliberate limitation, not a
                permanent arrangement: a student is not the right long-term
                custodian of patient health data.
              </p>
              <p>
                In an official roll-out, control of this data would transfer to
                the participating health facilities or the Ministry of Health, a
                qualified Data Protection Officer would be appointed, and the
                platform would be registered with the National Cyber Security
                Authority before the first live referral. Until that happens the
                system processes only simulated data.
              </p>
            </Clause>

            <Clause id="data-we-hold" title="2. What data we hold">
              <p>
                To coordinate an Intensive Care (ICU) or High-Dependency (HDU)
                transfer, the platform records:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Referral routing data</strong> — the referring
                  facility, requested unit, preferred destination, and the
                  resources the patient will need on arrival.
                </li>
                <li>
                  <strong>Identifying patient data</strong> — full name, date of
                  birth, sex, home address, and caregiver or mother contact
                  details, so the receiving hospital can identify and admit the
                  patient. These are entered on the transfer form, either with
                  the referral or shortly afterwards where the referral began
                  with a phone call. We do <strong>not</strong> collect a
                  national identity number.
                </li>
                <li>
                  <strong>Special-category health data</strong> — diagnosis,
                  comorbidities, clinical findings, vital signs, laboratory
                  results, and where clinically relevant sensitive information
                  such as HIV status or disability. This is the most sensitive
                  data in the system. It is used only for the care of that
                  patient, and never for research, reporting, or analytics
                  without separate ethical approval.
                </li>
                <li>
                  <strong>Referral workflow data</strong> — referring and
                  receiving facilities, status history, transport events, and
                  the patient's condition on arrival.
                </li>
                <li>
                  <strong>Optional dictation</strong> — a voice recording,
                  transcript, and generated summary, only when a clinician
                  chooses to dictate a handover.
                </li>
                <li>
                  <strong>User account data</strong> — your name, professional
                  Medical ID, role, facility, and contact details, used to
                  authenticate you and route notifications.
                </li>
              </ul>
            </Clause>

            <Clause id="why" title="3. Why we process it">
              <p>
                We process this data to coordinate emergency medical referrals:
                to let a receiving hospital accept a critically ill patient and
                prepare for their arrival. Under Law No. 058/2021 relating to
                the protection of personal data and privacy, this rests on the
                vital interests of the patient and the performance of a task in
                the public interest.
              </p>
              <p>
                We do not rely on the patient's consent, and it matters that we
                say so plainly. A patient being transferred to intensive care is
                frequently unconscious, sedated, or in acute distress. Consent
                obtained in that moment would not be freely given, and treating
                it as valid would be a fiction that transfers responsibility
                onto the person least able to carry it. The safeguards in this
                policy exist precisely because consent is not available to
                protect them.
              </p>
              <p>
                We do not use patient data for advertising. We do not sell it.
                We do not share it with any third party outside the care of the
                patient.
              </p>
            </Clause>

            <Clause id="where" title="4. Where the data is processed">
              <div className="rounded-md border bg-muted/40 p-4">
                <p className="flex items-start gap-2 text-sm text-foreground">
                  No clinical information is sent to any external company, and
                  no clinical information leaves Rwanda.
                </p>
              </div>
              <p>
                The platform is deployed on infrastructure hosted in Rwanda. The
                two AI features run on that same infrastructure as services we
                operate ourselves: <strong>Faster-Whisper</strong> converts
                dictated speech to text, and a locally hosted{" "}
                <strong>Ollama</strong> model drafts referral summaries. Neither
                calls out to an external provider.
              </p>
              <p>
                This is a deliberate design decision.
                Using a commercial transcription or summarization service would
                have been faster to build, but it would have meant audio of a
                clinician describing a critically ill Rwandan patient being
                transmitted to servers in another country, and it would have
                placed that data under someone else's terms of service. Running
                the models locally keeps the data inside the jurisdiction whose
                law protects it, and means no vendor can change the terms later.
              </p>
            </Clause>

            <Clause id="who-sees" title="5. Who can see the data">
              <p>
                Access is restricted by role and by facility. A referral is
                visible only to the referring facility, the facilities it was
                sent to, the assigned transport coordinator, and authorized
                system administrators. Staff at unrelated facilities cannot open
                it, and this is enforced on every request rather than by hiding
                the link.
              </p>
              <p>
                Curiosity is the most common reason health records get read by
                someone who had no business reading them, and Kigali's critical
                care community is small enough that staff often know the patients
                personally. Access control alone is not enough to address that,
                which is why every access is logged and attributable to a named
                account.
              </p>
            </Clause>

            <Clause id="retention" title="6. Retention & deletion of data">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4 font-semibold text-foreground">
                        Data
                      </th>
                      <th className="py-2 font-semibold text-foreground">
                        How long we keep it
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {RETENTION_ROWS.map((row) => (
                      <tr key={row.category} className="border-b align-top">
                        <td className="py-2 pr-4 font-medium text-foreground">
                          {row.category}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {row.period}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                To ask for personal data to be corrected or deleted, contact us
                using the details below. Because a referral is part of a clinical
                record, we may be required to keep it even where you ask us not
                to; if that happens we will tell you which obligation prevents
                deletion.
              </p>
            </Clause>

            <Clause id="ai" title="7. Voice dictation and AI-assisted summaries">
              <p>
                When a clinician chooses to dictate, the platform records audio,
                transcribes it, and drafts a summary to speed up documentation.
                Both steps run on our own servers (clause 4).
              </p>
              <p>
                This is <strong>optional and assistive</strong>. A generated
                summary is a draft and nothing more. The original transcript is
                shown alongside it so the clinician can see what the model
                changed, generated text is visually marked as machine-written,
                and nothing enters the referral until a clinician has read,
                edited where necessary, and confirmed it. The clinician — not the
                model — is accountable for what the referral says.
              </p>
              <p>
                We are explicit about this because the risk is not that the
                model is usually wrong. The risk is that in an emergency
                transfer, under time pressure, a summary that quietly omits a
                comorbidity gets accepted unread. Confirmation is a deliberate
                action, never a default.
              </p>
            </Clause>

            <Clause id="children" title="8. Data about children">
              <p>
                Neonatal and paediatric transfers are within the scope of this
                system, so it holds data about children, along with a caregiver's
                or mother's contact number collected while that person is not
                present.
              </p>
              <p>
                A caregiver's contact details are used only to coordinate the
                transfer and are not kept beyond the referral. Rights over a
                child's data are exercised by their parent or legal guardian. No
                data about a child is used for any purpose other than that
                child's care.
              </p>
            </Clause>

            <Clause id="transport" title="9. Ambulance transport and driver location">
              <p>
                When an ambulance is assigned, the driver application reports the
                vehicle's location so that the receiving hospital knows when the
                patient will arrive. That location trail is also a record of an
                employee's movements, and we treat it as such rather than as
                neutral logistics data.
              </p>
              <p>
                Location data is collected only while a transfer is active, is
                recorded against that transfer rather than against the driver,
                and is deleted 30 days after the transfer completes. There is no
                view of a driver's or a vehicle's movements across transfers. It
                is not used to assess a driver's performance or conduct. Drivers
                are told what the application records before they are enrolled.
              </p>
            </Clause>

            <Clause id="no-automation" title="10. Decisions are made by people, not by the system">
              <p>
                The platform never accepts a referral, rejects a referral,
                assigns an ambulance, or selects a destination hospital on its
                own. It shows people what is available and records what they
                decide. Every clinical and operational decision is made by an
                identified healthcare professional and attributed to them.
              </p>
              <p>
                You are therefore not subject to a decision about your care made
                solely by automated means through this platform.
              </p>
            </Clause>

            <Clause id="your-rights" title="11. Your rights">
              <p>
                You have the right to know what personal data we hold about you,
                to ask for inaccurate data to be corrected, to object to certain
                processing, and to complain to Rwanda's data protection
                authority. We respond to requests within{" "}
                <strong>30 days</strong>. Some rights are limited where a
                referral forms part of a clinical record that must be preserved.
              </p>
              <p>
                One limitation deserves stating rather than hiding: a patient
                who was unconscious throughout their transfer may never learn
                this system was involved, which makes these rights difficult to
                exercise in practice. Before any live deployment, referring
                facilities should give patients or their families a printed
                notice, so that exercising a right does not depend on having
                already found this page.
              </p>
            </Clause>

            <Clause id="security" title="12. Security & breaches">
              <p>
                Passwords are hashed with Argon2 and sessions use short-lived
                tokens. All traffic runs over encrypted connections. Access is
                checked on every request rather than only at sign-in.
              </p>
              <p>
                Every login, view, and change to a referral is written to an
                append-only audit log. Entries are only ever added, never edited
                or removed through the application.
              </p>
              <p>
                If personal data is exposed, lost, or accessed without
                authorisation, we will notify the affected facilities and the
                National Cyber Security Authority{" "}
                <strong>within 48 hours</strong> of becoming aware, and tell
                affected individuals where the law requires it. No system is
                perfectly secure, and a platform holding this kind of data should
                say so rather than imply otherwise.
              </p>
            </Clause>

            <Clause id="changes" title="13. Changes to this policy">
              <p>
                This is version {POLICY_VERSION}, last updated on {LAST_UPDATED}
                . If we change how data is handled in a way that affects you, we
                will raise the version number and show a notice in the
                application at your next sign-in. Minor corrections are recorded
                by updating the date above.
              </p>
            </Clause>
          </div>

          {/* ── EULA ── */}
          <div id="eula" className="scroll-mt-24 space-y-8">
            <h2 className="border-b pb-2 text-xl font-bold text-foreground">
              End-User License Agreement (EULA)
            </h2>

            <Clause id="eula-licence" title="14. Licence and acceptable use">
              <p>
                eBuzimaTransfer is an independent platform for authorised
                healthcare professionals to coordinate patient referrals. You
                are granted a limited, non-transferable right to use it for that
                purpose only.
              </p>
              <p>
                You must not attempt to reach data outside your authorised role,
                open a referral you have no clinical reason to open, share
                patient data beyond the care of that patient, extract data in
                bulk, reverse-engineer the system, or use it for any unlawful
                purpose.
              </p>
            </Clause>

            <Clause id="eula-accounts" title="15. Accounts and credentials">
              <p>
                Your account is personal to you and tied to your Medical ID. You
                are responsible for keeping your password confidential and for
                what happens under your account. You must not share credentials
                or let another person act under your identity, including a
                colleague on the same shift.
              </p>
              <p>
                We recognize that shared workstations at handover create
                pressure to do exactly that. Sign-in is designed to be quick
                enough that using your own account is the easier option. If it
                is not, tell us, because the answer is to fix the sign-in rather
                than to expect staff to absorb the friction. Report any suspected
                compromise immediately.
              </p>
            </Clause>

            <Clause id="eula-liability" title="16. Clinical responsibility">
              <p>
                The platform supports clinical coordination. It does not replace
                clinical judgement. Decisions about patient care, acceptance, and
                transport remain with the treating clinicians and facilities.
              </p>
              <p>
                Capacity figures, routing information, and generated summaries
                are provided on a best-effort basis and may not reflect the
                situation on the ground at the moment you read them. Verify
                anything critical before acting on it.
              </p>
              <p>
                eBuzimaTransfer is <strong>not a registered medical device</strong>{" "}
                and has not been assessed or approved by the Rwanda Food and
                Drugs Authority or any equivalent regulator. It is provided
                without warranty of any kind. It is not certified for use as a
                sole system of record for clinical care.
              </p>
            </Clause>

            <Clause id="eula-termination" title="17. Termination & governing law">
              <p>
                Your access may be suspended or withdrawn if you leave a
                participating facility, if your professional registration lapses,
                or if you breach clause 14 or 15. Where access is withdrawn for a
                suspected breach you will be told the reason, and referrals you
                created remain part of the clinical record.
              </p>
              <p>
                This agreement is governed by the laws of the Republic of Rwanda,
                and disputes fall to the competent courts of Rwanda.
              </p>
            </Clause>
          </div>

          {/* Contact */}
          <section id="contact" className="scroll-mt-24 rounded-lg border p-5">
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              Contact
            </h2>
            <p className="text-sm text-muted-foreground">
              Questions, access requests, or complaints about how data is handled
              can be sent to{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium text-primary underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
              . This is the project contact for the current academic phase, not a
              statutory Data Protection Officer; a qualified DPO would be
              appointed before any live clinical deployment (clause 1).
            </p>
          </section>

          <p className="pt-2 text-xs text-muted-foreground">
            <strong>Disclaimer:</strong> eBuzimaTransfer is an independent
            academic project. It is not affiliated with, authorised by, or
            endorsed by the Ministry of Health or any government body. Transfer
            form layouts are modelled on standard Rwandan referral forms for
            familiarity only, and that resemblance should not be read as official
            approval.
          </p>
          <p className="text-xs text-muted-foreground">
            eBuzimaTransfer © {new Date().getFullYear()}. By using the platform
            you acknowledge this Privacy Policy and agree to the End-User License
            Agreement.
          </p>
        </main>
      </div>
    </div>
  );
}
