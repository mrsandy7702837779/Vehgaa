import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface QCReport {
  vehicleSummary: {
    makeModel: string;
    regNo: string;
    fuelType: string;
    transmission: string;
    kmReading: string;
    location: string;
  };
  marketAnalysis: {
    lowestPrice: string;
    highestPrice: string;
    averagePrice: string;
    reportedValuation: string;
    status: "Within Range" | "Outside Range";
  };
  verificationMatrix: {
    check: string;
    status: "Pass" | "Fail" | "Alert" | "Not Available";
    remarks: string;
  }[];
  documentVerification: {
    rcMatchStatus: "Match" | "Mismatch" | "Not Provided";
    mismatches: string[];
    expiryIssues: string;
  };
  photoQC: {
    mandatoryPhotos: "Complete" | "Missing";
    missingPhotos: string[];
    locationConsistency: "Consistent" | "Inconsistent";
    timeConsistency: "Consistent" | "Inconsistent";
    visibility: "Clear" | "Blurry/Dark";
  };
  vehicleCondition: {
    observedIssues: string[];
    missingParts: string[];
    damageDetected: string[];
    tyreCondition: string;
    reportVsActualMatch: "Match" | "Mismatch";
  };
  identityVerification: {
    registrationMatch: "Match" | "Mismatch";
    chassisMatch: "Match" | "Mismatch";
    vinMatch: "Match" | "Mismatch";
    tamperingDetected: "Yes" | "No";
  };
  dateValidation: {
    inspectionDateMatch: "Match" | "Mismatch";
    reportDateValid: "Valid" | "Invalid";
  };
  riskFlags: string[];
  qcRemarks: string;
  finalVerdict: "Recommended" | "Recommended with Conditions" | "Not Recommended";
  justification: string;
}

export async function analyzeDocuments(valuationPdfBase64: string, rcImageBase64?: string): Promise<QCReport> {
  const currentDate = new Date().toISOString();
  const prompt = `
    You are a Senior Motor Insurance Surveyor and QC Auditor. 
    Analyze the provided Vehicle Valuation Report (PDF) and optional RC Copy (Image).
    Current Date and Time: ${currentDate}
    
    STRICT VERIFICATION CHECKLIST (Verify every point):
    1. Valuation Price: Check market price (OLX, CarWale, OBV, etc.). Display Lowest, Highest, Average. Alert if reported valuation is outside range.
    2. Document Validity: Check for lapsed documents (Insurance, RC, etc.).
    3. Inspection Date Match: Match report inspection date with dates visible on photos (Date only).
    4. Report Date Validity: Must not be future date. Must not be > 30 days old.
    5. Registration No Match: Cross-check Reg No in Photos vs Report vs RC.
    6. Chassis No Match: Cross-check Chassis No in Photos vs Report vs RC.
    7. Mfg vs Reg Gap: Flag if Registration Year is > 6 months after Manufacturing Year.
    8. Transmission Logic: "AT" in model = Automatic, else Manual.
    9. Fuel Type Match: Cross-check Report vs RC.
    10. Mandatory Photos: Front, Rear, Front Right/Left, Side Right/Left, Rear Right/Left, Chassis No, VIN Plate, Odometer, Selfie.
    11. Photo Consistency: Check if all photos are in the same location and no major time gaps between them.
    12. Number Plate Visibility: Check if front/rear plates are clearly visible and match documents.
    13. TYRE INSPECTION (CRITICAL): 
        - For multi-axle commercial vehicles (e.g., 8x2, 10x2 trucks), identify the axle configuration.
        - Verify every wheel position. Specifically check the LIFT AXLE (often the 2nd or 3rd axle) for missing tyres.
        - Identify cases where ONLY WHEEL DISCS/RIMS exist WITHOUT TYRES.
        - Check for "Stepney" (spare tyre) presence.
        - Look for bad tyre condition (worn out treads, flat tyres).
        - Cross-verify with report text (e.g., if report says "Tyre Condition: Good" but a tyre is missing on the lift axle, FLAG AS CRITICAL MISMATCH).
    14. Vehicle Condition: Detect missed parts, damaged, or accidental parts.
    15. Photo Clarity: Ensure photos are in daylight and clearly visible.
    16. Page 2 Cross-Verify: Cross-verify condition details on page 2 of report with actual photos. Identify mismatches.
    17. Chassis vs Stencil: Check if Chassis number photo matches with Chassis stencil photo.
    18. Chassis Punch: Check for tampering, re-punching, or abnormalities in chassis punch.
    19. RC Detail Cross-Check: Cross-check all entered report details with RC and notify mismatches.
    20. QC Remarks: Provide concise professional remarks.
    21. Final Verdict: Recommended / Not Recommended / Recommended with Conditions.
    
    Return the analysis in the following JSON format:
    {
      "vehicleSummary": { "makeModel": "", "regNo": "", "fuelType": "", "transmission": "", "kmReading": "", "location": "" },
      "marketAnalysis": { "lowestPrice": "", "highestPrice": "", "averagePrice": "", "reportedValuation": "", "status": "Within Range/Outside Range" },
      "verificationMatrix": [
        { "check": "Valuation Price Range", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Document Validity", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Inspection Date Match", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Report Date Validity", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Registration No Match", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Chassis No Match", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Mfg vs Reg Gap", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Transmission Logic", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Fuel Type Match", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Mandatory Photos Presence", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Photo Location/Time Consistency", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Number Plate Visibility", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Tyre Condition & Presence (Wheel Discs without Tyres)", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Vehicle Condition (Damages/Parts)", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Photo Clarity & Daylight", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Report Page 2 Cross-Verification", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Chassis vs Stencil Match", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "Chassis Punch Integrity", "status": "Pass/Fail/Alert", "remarks": "" },
        { "check": "RC Detail Cross-Check", "status": "Pass/Fail/Alert", "remarks": "" }
      ],
      "documentVerification": { "rcMatchStatus": "Match/Mismatch/Not Provided", "mismatches": [], "expiryIssues": "" },
      "photoQC": { "mandatoryPhotos": "Complete/Missing", "missingPhotos": [], "locationConsistency": "Consistent/Inconsistent", "timeConsistency": "Consistent/Inconsistent", "visibility": "Clear/Blurry/Dark" },
      "vehicleCondition": { "observedIssues": [], "missingParts": [], "damageDetected": [], "tyreCondition": "", "reportVsActualMatch": "Match/Mismatch" },
      "identityVerification": { "registrationMatch": "Match/Mismatch", "chassisMatch": "Match/Mismatch", "vinMatch": "Match/Mismatch", "tamperingDetected": "Yes/No" },
      "dateValidation": { "inspectionDateMatch": "Match/Mismatch", "reportDateValid": "Valid/Invalid" },
      "riskFlags": [],
      "qcRemarks": "",
      "finalVerdict": "Recommended/Recommended with Conditions/Not Recommended",
      "justification": ""
    }
  `;

  const contents: any[] = [
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: valuationPdfBase64 } }
  ];

  if (rcImageBase64) {
    contents.push({ inlineData: { mimeType: "image/jpeg", data: rcImageBase64 } });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: contents }],
    config: {
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text || "{}");
}
