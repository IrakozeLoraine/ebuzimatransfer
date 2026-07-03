/**
 * Declarative definitions of the Rwanda Ministry of Health patient-transfer forms.
 *
 * The platform routes/decides on a small set of core fields (patient code, age,
 * sex, diagnosis, acuity, urgency, reason, destination) that are the same across
 * every form. Everything else on each paper form differs by clinical context, so
 * it is described here once and rendered from a single source of truth both as an
 * input form (DynamicFormFields) and as a read-only summary (DynamicFormDetails).
 *
 * The values for these fields are stored together under the referral's
 * ``form_data`` JSON map, keyed by field ``name``.
 */

export type FormType = "EXTERNAL" | "NEONATAL" | "OBSTETRIC" | "INTERNAL" | "MONITORING";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "time"
  | "datetime"
  | "select"
  | "radio"
  | "checkbox"
  | "checkboxGroup"
  | "table"
  // Cascading Province→District→Sector→Cell→Village picker. Stores its values under
  // the fixed keys province/district/sector/cell/village (not under the field name).
  | "address";

export interface TableColumn {
  key: string;
  label: string;
  /** Narrower input for short values like times/numbers. */
  type?: "text" | "number" | "time";
}

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  /** Options for select / radio / checkboxGroup. */
  options?: string[];
  placeholder?: string;
  /** Unit suffix shown after the input, e.g. "°C", "%". */
  suffix?: string;
  /** Span the full row instead of half-width. */
  full?: boolean;
  /** Columns for a table field. */
  columns?: TableColumn[];
  /** Fixed left-hand row labels for a matrix table (e.g. Dose / Date / Time). */
  rowLabels?: string[];
  /** Initial number of editable rows for a dynamic table. */
  initialRows?: number;
  /** Shows a required asterisk; validation is enforced by the zod schema (core fields). */
  required?: boolean;
  /** Display labels for select/radio options whose stored value differs (e.g. M→Male). */
  optionLabels?: Record<string, string>;
  /** Prefilled, read-only fields (e.g. receiving facility/service derived from the destination). */
  readOnly?: boolean;
}

export interface FormSection {
  title: string;
  /** Optional helper note shown under the section title. */
  note?: string;
  fields: FieldDef[];
}

export interface TransferFormDef {
  type: FormType;
  label: string;
  description: string;
  sections: FormSection[];
}

// ---- field builders (keep the full-fidelity definitions readable) -------------

const t = (name: string, label: string, opts: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: "text", ...opts });
const ta = (name: string, label: string, opts: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: "textarea", full: true, ...opts });
const num = (name: string, label: string, suffix?: string, opts: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: "number", suffix, ...opts });
const date = (name: string, label: string, opts: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: "date", ...opts });
const time = (name: string, label: string, opts: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: "time", ...opts });
const datetime = (name: string, label: string, opts: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: "datetime", ...opts });
const rad = (name: string, label: string, options: string[], opts: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: "radio", options, ...opts });
const chk = (name: string, label: string): FieldDef => ({ name, label, type: "checkbox" });
const chkg = (name: string, label: string, options: string[]): FieldDef => ({ name, label, type: "checkboxGroup", options, full: true });
const tbl = (name: string, label: string, columns: TableColumn[], opts: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: "table", columns, full: true, ...opts });

const YN = ["Yes", "No", "Unknown"];
const TRANSFER_TYPES = ["Emergency", "Not-emergency", "Follow up"];
const INSURANCE = ["CBHI (mutuelle)", "RSSB", "MMI", "Other", "None"];

const sel = (name: string, label: string, options: string[], opts: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: "select", options, ...opts });

// Field names that map to top-level referral columns (used for routing/decisions)
// rather than the form_data JSON. The new-request form routes these accordingly.
export const CORE_FIELD_NAMES = [
  "patient_code", "sex", "diagnosis", "reason_for_transfer",
] as const;

// Core patient-identity fields (shown within each form's own identification section).
// patient_code / sex back top-level columns; name + DOB are the paper-form identity
// captured in form_data. (Age band was dropped — DOB is captured instead.)
const PATIENT_CORE: FieldDef[] = [
  t("patient_name", "Client name"),
  t("patient_code", "Serial number in register / EMR ID"),
  date("date_of_birth", "Date of birth (DOB)"),
  sel("sex", "Sex", ["M", "F"], { required: true, optionLabels: { M: "Male", F: "Female" } }),
];

// Transfer-decision fields, shown in each form's Transfer Details section (moved out
// of the old, now-removed Clinical Summary section).
const TRANSFER_DECISION: FieldDef[] = [
  ta("reason_for_transfer", "Reason for transfer", { required: true }),
];

// Referring health provider — name is autofilled (read-only) with the logged-in
// clinician; they add their qualification.
const REFERRING_PROVIDER: FieldDef[] = [
  t("referring_provider_name", "Referring health provider", { readOnly: true }),
  t("referring_provider_qualification", "Qualification"),
];

// Diagnosis — placed into each form's investigation/clinical section.
const DIAGNOSIS: FieldDef = ta("diagnosis", "Diagnosis", { required: true });

// Receiving facility + service — prefilled (read-only) from the chosen destination.
const RECEIVING: FieldDef[] = [
  t("receiving_facility", "Receiving facility", { readOnly: true }),
  t("receiving_service", "Receiving service / unit", { readOnly: true }),
];

// Reusable address block — a single cascading Province→District→Sector→Cell→Village
// picker. Stores province/district/sector/cell/village keys.
const ADDRESS: FieldDef[] = [{ name: "address", label: "Address", type: "address", full: true }];

// Location keys the address picker writes to (used for voice spec + read-only view).
export const ADDRESS_KEYS = ["province", "district", "sector", "cell", "village"] as const;

// =============================================================================
// EXTERNAL TRANSFER FORM (general adult external transfer)
// =============================================================================
const EXTERNAL: TransferFormDef = {
  type: "EXTERNAL",
  label: "External Transfer Form",
  description: "General external transfer between facilities.",
  sections: [
    {
      title: "Patient Identification",
      fields: [
        ...PATIENT_CORE,
        t("caregiver_name", "Name of caregiver"),
        t("caregiver_phone", "Telephone"),
        ...ADDRESS,
      ],
    },
    {
      title: "Transfer Details",
      note: "Receiving facility & service are filled from your chosen destination. If you already called the receiving facility, record who you spoke to and when.",
      fields: [
        ...RECEIVING,
        datetime("admission_datetime", "Date & time of admission"),
        datetime("decision_datetime", "Date & time of decision to transfer"),
        time("calling_time", "Calling time"),
        t("staff_contacted", "Staff contacted at receiving facility"),
        t("staff_contacted_phone", "Staff phone"),
        rad("transfer_type", "Type of transfer", TRANSFER_TYPES),
        time("ambulance_called_time", "If emergency: time ambulance called"),
        time("departure_time", "Time of departure from referring facility"),
        ...TRANSFER_DECISION,
        ...REFERRING_PROVIDER,
      ],
    },
    {
      title: "Significant Findings",
      fields: [
        ta("clinical_presentation", "Clinical presentation"),
        t("disability_type", "If person with disability, type of disability", { full: true }),
      ],
    },
    {
      title: "Vital Signs",
      fields: [
        num("temperature", "Temperature", "°C"),
        num("spo2", "SpO₂", "%"),
        num("respiratory_rate", "Respiratory rate", "/min"),
        num("pulse", "Pulse", "bpm"),
        t("blood_pressure", "Blood pressure", { suffix: "mmHg" }),
        num("weight", "Weight", "kg"),
        num("height", "Height", "cm"),
        num("muac", "MUAC", "cm"),
      ],
    },
    {
      title: "Investigations & Management",
      fields: [
        DIAGNOSIS,
        ta("laboratory", "Laboratory"),
        ta("other_findings", "Others"),
        ta("procedures_treatments", "Procedures and treatments"),
      ],
    },
    {
      title: "Logistics",
      fields: [
        rad("transportation_type", "Type of transportation", ["Ambulance", "Other", "NA"]),
        t("transportation_other", "Transportation (if other, specify)"),
        rad("health_insurance", "Health insurance", INSURANCE),
        t("insurance_other", "Insurance (if other, specify)"),
      ],
    },
  ],
};

// =============================================================================
// NEONATAL TRANSFER FORM
// =============================================================================
const NEONATAL: TransferFormDef = {
  type: "NEONATAL",
  label: "Neonatal Transfer Form",
  description: "Transfer of a neonate — full maternal, labour and neonatal history.",
  sections: [
    {
      title: "Neonate Identification",
      fields: [
        t("baby_name", "Name of baby"),
        t("patient_code", "Serial number in register / EMR ID"),
        date("date_of_birth", "Date of birth (DOB)"),
        sel("sex", "Sex", ["M", "F"], { required: true, optionLabels: { M: "Male", F: "Female" } }),
        num("gestational_age_weeks", "Gestational age", "weeks"),
        num("birth_weight_g", "Birth weight", "g"),
        num("current_weight_g", "Current weight", "g"),
        num("current_age_days", "Current age (DoL)", "days"),
        rad("place_of_birth", "Place of birth", ["Home", "Private facility", "En-route", "Public facility"]),
        t("mother_name", "Name of mother"),
        num("mother_age", "Mother's age", "years"),
        t("mother_phone", "Mother / caregiver phone"),
      ],
    },
    {
      title: "Transfer Details",
      note: "Receiving facility & service are filled from your chosen destination.",
      fields: [
        ...RECEIVING,
        rad("mode_of_transport", "Mode of transport", ["Ambulance", "Other"]),
        t("transport_other", "Transport (if other, specify)"),
        rad("transfer_type", "Type of transfer", ["Emergency", "Not-emergency"]),
        ...TRANSFER_DECISION,
        ...REFERRING_PROVIDER,
      ],
    },
    {
      title: "Maternal History",
      fields: [
        rad("mother_alive", "Mother is alive", YN),
        t("grav_parity", "Grav-Parity (G_ P_)"),
        rad("pregnancy_type", "Type of pregnancy", ["Singleton", "Twin", "Other", "Unknown"]),
        chkg("anc_screening", "ANC screening", ["Toxo", "Rubella", "Syphilis", "Hep B & C", "U/S", "Other"]),
        t("blood_group", "Blood group"),
        t("rh", "Rh"),
        rad("hiv_status", "HIV status", ["Eligible", "Non-eligible", "Unknown"]),
        t("hiv_regimen", "If eligible: regimen"),
        t("recent_vl", "Recent VL"),
        t("cd4_count", "CD4 count"),
        t("opportunistic_infections", "Opportunistic infections"),
        num("tetanus_doses", "Tetanus vaccines: number of doses"),
        t("maternal_illicit_drug_history", "Maternal illicit drug history"),
        chkg("pregnancy_pathologies", "Pathologies during pregnancy", ["Anemia", "Pre-eclampsia", "TB", "Diabetes", "Asthma"]),
        t("infections_others", "Infections / others (specify)", { full: true }),
        ta("treatment_during_pregnancy", "Treatment during pregnancy"),
      ],
    },
    {
      title: "Labor Details",
      fields: [
        datetime("rom_datetime", "ROM date/time"),
        rad("af_quality", "AF quality", ["Clear", "Meconium stained", "Unknown"]),
        rad("af_quantity", "AF quantity", ["Adequate", "Oligo", "Polyhydramnios", "Unknown"]),
        rad("fever", "Fever", ["Prior", "During", "After delivery", "NA"]),
        rad("steroid_doses", "Steroid doses", ["1", "2", "3", "4", "Unknown", "NA"]),
        datetime("last_steroid_datetime", "Last dose steroid date/time"),
        datetime("mgso4_datetime", "MgSO4 date/time"),
        rad("mode_of_delivery", "Mode of delivery", ["SVD", "Vacuum", "Elective CS", "Emergency CS"]),
        chkg("labor_complications", "Labor complications", ["PROM", "Maternal fever", "Prematurity", "Maternal infection", "Born en-route/home", "PPH", "Praevia", "Abruption", "Fetal distress", "Other"]),
        rad("maternal_anesthesia", "Maternal anesthesia", ["Sedation", "Other"]),
        rad("maternal_antibiotics", "Maternal antibiotics", YN),
      ],
    },
    {
      title: "Neonatal History",
      fields: [
        rad("resuscitation_at_birth", "Resuscitation at birth", YN),
        chkg("resuscitation_measures", "If yes", ["Stimulation", "Suctioning", "BMV", "Oxygen", "Intubation", "Chest compressions"]),
        num("apgar_1min", "APGAR 1 min"),
        num("apgar_5min", "APGAR 5 min"),
        num("apgar_10min", "APGAR 10 min"),
        rad("hie", "HIE", YN),
        rad("hie_grade", "HIE grade", ["Mild", "Moderate", "Severe"]),
      ],
    },
    {
      title: "Drugs",
      fields: [
        rad("allergies", "Allergies", YN),
        t("allergies_specify", "Allergies (specify)"),
        rad("immunization", "Immunization", YN),
        t("immunization_cite", "Immunization (if yes, cite)"),
        rad("vitamin_k", "Vitamin K", YN),
        rad("tetracycline_eye_ointment", "Tetracycline eye ointment", YN),
        rad("surfactant", "Surfactant", YN),
      ],
    },
    {
      title: "Condition Prior to Transfer",
      fields: [
        DIAGNOSIS,
        ta("chief_complaint_details", "Chief complaint / details"),
        num("spo2_preductal", "SpO₂ preductal (right arm)", "%"),
        num("spo2_postductal", "SpO₂ postductal (foot)", "%"),
        num("temperature", "Temperature", "°C"),
        num("heart_rate", "Heart rate", "bpm"),
        num("respiratory_rate", "Respiratory rate", "/min"),
        t("blood_pressure", "Blood pressure", { suffix: "mmHg" }),
        rad("neuro_status", "Neurological status", ["Active", "Lethargic", "Unresponsive", "Seizures"]),
        rad("adverse_events_24h", "Adverse events in last 24 hrs", YN),
      ],
    },
    {
      title: "Neonatal Management at Referring Facility",
      fields: [
        rad("respiratory_support", "Respiratory support", ["None", "Low flow O2", "HFT", "CPAP", "Mechanical Ventilation"]),
        t("ventilation_settings", "Ventilation settings"),
        rad("blood_gas_analysis", "Blood gas analysis", ["Yes", "No"]),
        t("iv_fluid_vol", "IV fluid volume", { suffix: "ml/kg/day" }),
        rad("passed_urine", "Passed urine", YN),
        rad("inotropes", "Inotropes", ["No", "Yes", "Unknown"]),
        t("inotropes_specify", "Inotropes (specify)"),
        rad("peripheral_iv", "Peripheral IV", YN),
        rad("central_iv", "Central IV", YN),
        rad("intraosseous_line", "Intraosseous line", YN),
        ta("antibiotics_given", "Antibiotics given (names, doses, durations)"),
        rad("arvs", "ARVs", ["Yes", "No", "NA"]),
        rad("feeding_npo", "Feeding NPO", ["Yes", "No"]),
        t("last_feed", "If no: last feed"),
        rad("feed_type", "Feed type", ["Breastmilk", "Other"]),
        rad("passed_stool", "Passed stool", YN),
        rad("nasogastric_tube", "Nasogastric tube", ["Yes", "No"]),
        t("pain_sedation_drugs", "Pain / sedation drugs", { full: true }),
      ],
    },
    {
      title: "Latest Laboratory Results",
      fields: [
        t("lab_glucose", "Glucose"),
        rad("lab_fbc", "FBC", ["Yes", "No"]),
        t("lab_hb", "Hb"),
        t("lab_wbc", "WBC"),
        t("lab_plats", "Plats"),
        t("lab_crp", "CRP"),
        t("lab_bili_total", "Bili total"),
        t("lab_bili_direct", "Bili direct"),
        t("lab_ue", "U&E"),
        t("lab_cultures", "Cultures"),
      ],
    },
    {
      title: "Imaging & Records",
      fields: [
        rad("imaging_done", "Imaging results", ["Yes", "No"]),
        ta("imaging_results", "Imaging results (if yes)"),
        rad("imaging_report_attached", "Imaging report attached", ["Yes", "No"]),
        rad("lab_reports_attached", "Lab reports attached", ["Yes", "No"]),
        ta("clinical_management_summary", "Summary of clinical management at referring facility"),
      ],
    },
  ],
};

// =============================================================================
// ANC, DELIVERY AND PNC EXTERNAL TRANSFER FORM (obstetric / maternity)
// =============================================================================
const OBSTETRIC: TransferFormDef = {
  type: "OBSTETRIC",
  label: "ANC, Delivery & PNC Transfer Form",
  description: "Maternity transfer — obstetric history, labour and delivery details.",
  sections: [
    {
      title: "Patient Identification",
      fields: [
        ...PATIENT_CORE,
        t("next_of_kin", "Next of kin"),
        t("telephone", "Telephone"),
        ...ADDRESS,
      ],
    },
    {
      title: "Transfer Details",
      note: "Receiving facility & service are filled from your chosen destination. If you already called the receiving facility, record who you spoke to and when.",
      fields: [
        ...RECEIVING,
        date("admission_date", "Date of admission"),
        datetime("decision_datetime", "Date & time of decision to transfer"),
        time("calling_time", "Calling time"),
        t("staff_contacted", "Staff contacted at receiving facility"),
        t("staff_contacted_phone", "Staff phone"),
        rad("transfer_type", "Type of transfer", TRANSFER_TYPES),
        time("ambulance_called_time", "If emergency: time ambulance called"),
        time("departure_time", "Time of departure from referring facility"),
        chk("partograph_attached", "Copy of partograph attached"),
        ...TRANSFER_DECISION,
        ...REFERRING_PROVIDER,
      ],
    },
    {
      title: "Significant Findings",
      fields: [
        ta("clinical_presentation", "Clinical presentation"),
        t("disability_type", "If person with disability, type of disability", { full: true }),
      ],
    },
    {
      title: "Obstetric History",
      fields: [
        num("gravida", "Gravida"),
        num("parity", "Parity"),
        num("living_children", "Living children"),
        num("abortion", "Abortion"),
        num("stillbirth", "Stillbirth"),
        num("neonatal_death", "Neonatal death"),
        num("preterm_birth", "Preterm birth"),
        date("lmp", "LMP"),
        date("edd", "EDD"),
        t("gestation_age", "Gestation age"),
        num("muac", "MUAC", "cm"),
        num("anc_completed", "Number of ANC completed"),
        num("tetanus_doses", "Tetanus vaccines: number of doses"),
        ta("previous_significant_history", "Previous significant history (e.g. previous caesarean, PPH, hypertension, malaria, syphilis, diabetes…)"),
        t("multi_pregnancies_known_hiv", "Multi pregnancies / known HIV", { full: true }),
        ta("current_pregnancy_complications", "Current pregnancy complications"),
        t("latest_hemoglobin", "Latest test: hemoglobin"),
        t("latest_hiv", "HIV"),
        t("latest_blood_group", "Blood group"),
        t("latest_other", "Other"),
      ],
    },
    {
      title: "Maternal Vital Signs",
      fields: [
        t("blood_pressure", "Blood pressure", { suffix: "mmHg" }),
        num("temperature", "Temperature", "°C"),
        num("spo2", "SpO₂", "%"),
        num("respiratory_rate", "Respiratory rate", "/min"),
        num("pulse", "Pulse", "bpm"),
        num("weight", "Weight", "kg"),
        num("height", "Height", "cm"),
      ],
    },
    {
      title: "Abdominal Examination",
      fields: [
        t("fetal_presentation", "Fetal presentation"),
        t("fundal_height", "Fundal height"),
        t("fetal_heart_rate", "Fetal heart rate"),
        t("contractions", "Contractions (/10 minutes)"),
      ],
    },
    {
      title: "Vaginal Examination",
      fields: [
        datetime("vaginal_exam_datetime", "Date & time of latest examination"),
        t("dilation", "Dilation"),
        t("effacement", "Effacement"),
        t("descent", "Descent"),
        t("consistency", "Consistency"),
        t("position", "Position"),
        rad("caput", "Caput", ["Yes", "No"]),
        rad("moulding", "Moulding", ["Yes", "No"]),
        rad("membranes_ruptured", "Membranes ruptured", ["Yes", "No"]),
        datetime("membranes_ruptured_datetime", "If yes: date & time"),
        rad("amniotic_fluid_color", "Amniotic fluid color", ["Clear", "Meconium", "Bloody"]),
        rad("offensive", "Offensive", ["Yes", "No"]),
        num("estimated_blood_loss", "If bloody, estimated blood loss", "ml"),
      ],
    },
    {
      title: "Investigations & Imaging",
      fields: [
        DIAGNOSIS,
        t("hgb", "Hgb"),
        t("urine_test", "Urine test (specify)"),
        t("other_test", "Other test (specify)"),
        ta("imaging_investigations", "Imaging investigations"),
        ta("procedures", "Procedures"),
        rad("attached_lab", "Attached lab tests", ["Yes", "No"]),
        rad("attached_imaging", "Attached imaging", ["Yes", "No"]),
        t("attached_other", "Attached other"),
      ],
    },
    {
      title: "Treatment Received (time given & dose)",
      fields: [
        tbl("treatment_received", "Treatment received", [
          { key: "iv_fluids", label: "IV Fluids" },
          { key: "dexamethasone", label: "Dexamethasone" },
          { key: "magnesium_sulphate", label: "Magnesium sulphate" },
          { key: "nifedipine", label: "Nifedipine" },
          { key: "oxytocin", label: "Oxytocin" },
          { key: "atbs", label: "ATBs" },
        ], { rowLabels: ["Dose", "Date", "Time"] }),
        t("treatment_others", "Others", { full: true }),
      ],
    },
    {
      title: "Logistics",
      fields: [
        rad("transportation_type", "Type of transportation", ["Ambulance", "Private", "Other", "NA"]),
        t("transportation_other", "Transportation (if other, specify)"),
        rad("health_insurance", "Health insurance", INSURANCE),
        t("insurance_other", "Insurance (if other, specify)"),
      ],
    },
  ],
};

// =============================================================================
// INTERNAL TRANSFER FORM (between units within one facility)
// =============================================================================
const INTERNAL: TransferFormDef = {
  type: "INTERNAL",
  label: "Internal Transfer Form",
  description: "Transfer between units within the same facility.",
  sections: [
    {
      title: "Patient Identification",
      fields: [
        ...PATIENT_CORE,
        t("next_of_kin", "Name of next of kin"),
        t("telephone", "Telephone"),
        ...ADDRESS,
      ],
    },
    {
      title: "Transfer Details",
      note: "Receiving service is filled from your chosen destination unit.",
      fields: [
        ...RECEIVING,
        datetime("decision_datetime", "Date & time of decision to transfer"),
        t("referring_service", "Referring service"),
        t("staff_contacted", "Staff contacted"),
        t("staff_contacted_phone", "Staff phone"),
        ...TRANSFER_DECISION,
        ...REFERRING_PROVIDER,
      ],
    },
    {
      title: "Significant Findings",
      fields: [
        DIAGNOSIS,
        ta("clinical_condition", "Clinical condition prior to transfer"),
        t("disability_type", "If person with disability, type of disability", { full: true }),
        ta("ongoing_treatments", "Ongoing treatments"),
      ],
    },
  ],
};

// =============================================================================
// PATIENT MONITORING TRANSFER FORM (vitals logged during transport)
// =============================================================================
const MONITORING: TransferFormDef = {
  type: "MONITORING",
  label: "Patient Monitoring Transfer Form",
  description: "Monitoring of the patient during transportation.",
  sections: [
    {
      title: "Patient & Departure",
      fields: [
        t("caregiver_name", "Name of caregiver"),
        t("caregiver_phone", "Telephone"),
        date("transfer_date", "Date of transfer"),
        ...ADDRESS,
        t("referring_facility", "Name of referring facility"),
        time("departure_time", "Time of departure from referring facility"),
      ],
    },
    {
      title: "Vital Signs (every 30 minutes)",
      note: "Record the patient's vitals during transport. FHR and membranes apply if the patient is a woman in labour.",
      fields: [
        tbl("vital_signs", "Vital signs", [
          { key: "time", label: "Time", type: "time" },
          { key: "bp", label: "BP" },
          { key: "temp", label: "T°", type: "number" },
          { key: "spo2", label: "SpO₂", type: "number" },
          { key: "rr", label: "RR", type: "number" },
          { key: "pulse", label: "Pulse", type: "number" },
          { key: "fhr", label: "FHR" },
          { key: "membranes_ruptured", label: "Membranes ruptured" },
        ], { initialRows: 6 }),
      ],
    },
    {
      title: "Problems During Transportation",
      fields: [
        tbl("problems", "Problems & management", [
          { key: "problem", label: "Problem" },
          { key: "management", label: "Management" },
        ], { initialRows: 4 }),
      ],
    },
    {
      title: "Arrival",
      fields: [
        t("receiving_facility", "Name of receiving facility"),
        time("arrival_time", "Time of arrival at receiving facility"),
      ],
    },
    {
      title: "Health Care Providers",
      fields: [
        t("ambulance_provider_name", "Provider in ambulance — name"),
        t("ambulance_provider_qualification", "Qualification"),
        t("ambulance_provider_phone", "Phone"),
        datetime("ambulance_provider_datetime", "Date & time"),
        t("receiving_provider_name", "Provider receiving patient — name"),
        t("receiving_provider_qualification", "Qualification"),
        t("receiving_provider_phone", "Phone"),
        datetime("receiving_provider_datetime", "Date & time"),
      ],
    },
  ],
};

// =============================================================================
// RECEIVING-SIDE FORMS — filled at the receiving clinic per case.
// =============================================================================

/** A simple form (sections only) not tied to a request FormType. */
export interface ReceivingFormDef {
  key: "FEEDBACK" | "COUNTER_REFERRAL";
  label: string;
  description: string;
  sections: FormSection[];
}

// Referral Feedback — the receiving facility reports back on the patient's outcome.
export const FEEDBACK_FORM: ReceivingFormDef = {
  key: "FEEDBACK",
  label: "Referral Feedback",
  description: "Filled by the receiving facility — the outcome of the transferred patient.",
  sections: [
    {
      title: "Referral Feedback",
      fields: [
        date("date_admission_or_seen", "Date of admission / client seen at receiving facility"),
        date("date_discharge", "Date of discharge"),
        ta("final_diagnosis", "Final diagnosis"),
        ta("treatment_at_receiving", "Treatment at the receiving facility"),
        rad("outcome", "Outcome", [
          "Stabilized/Cured", "Died", "Escaped", "To be followed up", "Referred to high level",
        ]),
      ],
    },
    {
      title: "Health Care Provider",
      fields: [
        t("provider_name", "Name of health care provider"),
        t("provider_qualification", "Qualification"),
        t("provider_phone", "Phone"),
        datetime("provider_datetime", "Date & time"),
      ],
    },
  ],
};

// Counter-Referral — the receiving facility's recommendations / refer-back details.
export const COUNTER_REFERRAL_FORM: ReceivingFormDef = {
  key: "COUNTER_REFERRAL",
  label: "Counter-Referral",
  description: "Filled by the receiving facility — recommendations and refer-back details.",
  sections: [
    {
      title: "Counter-Referral",
      fields: [
        ta("recommendations", "Recommendations (follow up care)"),
        t("refer_back_facility", "Refer back to: name of facility"),
        t("contact_person", "Contact person"),
      ],
    },
    {
      title: "Health Care Provider",
      fields: [
        t("provider_name", "Name of health care provider"),
        t("provider_qualification", "Qualification"),
        t("provider_phone", "Phone"),
        datetime("provider_datetime", "Date & time"),
      ],
    },
  ],
};

export const TRANSFER_FORMS: Record<FormType, TransferFormDef> = {
  EXTERNAL,
  NEONATAL,
  OBSTETRIC,
  INTERNAL,
  MONITORING,
};

// Forms a clinician chooses from when raising a request. Patient Monitoring is
// excluded here — it is filled by the ambulance driver (by voice) during transport,
// not by the requesting clinician (see TransportMonitoring on the referral detail).
export const FORM_TYPE_ORDER: FormType[] = ["EXTERNAL", "NEONATAL", "OBSTETRIC", "INTERNAL"];

/** A compact field descriptor sent to the dictation service so it can extract the
 *  form-specific values from the clinician's spoken transcript. Table fields are
 *  omitted — they are filled by hand, not by voice. */
export interface VoiceFieldSpec {
  name: string;
  label: string;
  kind: "text" | "number" | "boolean" | "select" | "multi" | "date" | "time" | "datetime";
  options?: string[];
}

const CORE_NAME_SET = new Set<string>(CORE_FIELD_NAMES);

export const voiceSpecForForm = (type: string | null | undefined): VoiceFieldSpec[] => {
  const out: VoiceFieldSpec[] = [];
  for (const section of getFormDef(type).sections) {
    for (const f of section.fields) {
      // Skip tables (filled by hand), read-only autofilled fields, and the core
      // fields (those are extracted separately as the referral's core fields).
      if (f.type === "table" || f.readOnly || CORE_NAME_SET.has(f.name)) continue;
      if (f.type === "address") {
        for (const k of ADDRESS_KEYS) {
          out.push({ name: k, label: k.charAt(0).toUpperCase() + k.slice(1), kind: "text" });
        }
        continue;
      }
      const kind: VoiceFieldSpec["kind"] =
        f.type === "number" ? "number"
        : f.type === "checkbox" ? "boolean"
        : f.type === "checkboxGroup" ? "multi"
        : f.type === "select" || f.type === "radio" ? "select"
        : f.type === "date" ? "date"
        : f.type === "time" ? "time"
        : f.type === "datetime" ? "datetime"
        : "text";
      out.push({ name: f.name, label: f.label, kind, options: f.options });
    }
  }
  return out;
};

export const getFormDef = (type: string | null | undefined): TransferFormDef =>
  TRANSFER_FORMS[(type as FormType) ?? "EXTERNAL"] ?? EXTERNAL;

/**
 * Best-guess default form for the hybrid selector: an internal transfer when the
 * destination is the requester's own facility; otherwise inferred from the
 * requested unit's name/code (neonatal, maternity), falling back to External.
 * The clinician can always override the choice.
 */
export const defaultFormTypeForUnit = (
  unitName: string | null | undefined,
  isOwnFacility: boolean
): FormType => {
  if (isOwnFacility) return "INTERNAL";
  const s = (unitName ?? "").toLowerCase();
  if (/(neonat|nicu|newborn)/.test(s)) return "NEONATAL";
  if (/(matern|obstet|anc|antenatal|delivery|labou?r|pnc|postnatal|gyn)/.test(s)) return "OBSTETRIC";
  return "EXTERNAL";
};
