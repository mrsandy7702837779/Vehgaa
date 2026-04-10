import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  ShieldCheck, 
  Upload, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Download, 
  Car, 
  Camera, 
  Calendar, 
  Search,
  Loader2,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeDocuments, QCReport } from './services/geminiService';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// --- Components ---

const StatusBadge = ({ status }: { status: string }) => {
  const isPositive = status === 'Match' || status === 'Complete' || status === 'Consistent' || status === 'Clear' || status === 'Valid' || status === 'Within Range' || status === 'No';
  const isNegative = status === 'Mismatch' || status === 'Missing' || status === 'Inconsistent' || status === 'Blurry/Dark' || status === 'Invalid' || status === 'Outside Range' || status === 'Yes';
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${
      isPositive ? 'bg-green-100 text-green-700 border border-green-200' : 
      isNegative ? 'bg-red-100 text-red-700 border border-red-200' : 
      'bg-amber-100 text-amber-700 border border-amber-200'
    }`}>
      {status}
    </span>
  );
};

const SectionHeader = ({ icon: Icon, title }: { icon: any, title: string }) => (
  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
    <Icon className="w-4 h-4 text-gray-500" />
    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-700">{title}</h3>
  </div>
);

const DataRow = ({ label, value, status }: { label: string, value: string | string[], status?: string }) => (
  <div className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
    <span className="text-[11px] text-gray-500 font-medium">{label}</span>
    <div className="flex flex-col items-end gap-1">
      {Array.isArray(value) ? (
        <div className="flex flex-wrap gap-1 justify-end">
          {value.length > 0 ? value.map((v, i) => (
            <span key={i} className="text-[11px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{v}</span>
          )) : <span className="text-[11px] font-mono text-gray-400">None</span>}
        </div>
      ) : (
        <span className="text-[11px] font-mono text-gray-900 text-right">{value || 'Not Available'}</span>
      )}
      {status && <StatusBadge status={status} />}
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [valuationPdf, setValuationPdf] = useState<File | null>(null);
  const [rcImage, setRcImage] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<QCReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDropValuation = useCallback((acceptedFiles: File[]) => {
    setValuationPdf(acceptedFiles[0]);
  }, []);

  const onDropRc = useCallback((acceptedFiles: File[]) => {
    setRcImage(acceptedFiles[0]);
  }, []);

  const { getRootProps: getValuationProps, getInputProps: getValuationInput, isDragActive: isValuationActive } = useDropzone({
    onDrop: onDropValuation,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  } as any);

  const { getRootProps: getRcProps, getInputProps: getRcInput, isDragActive: isRcActive } = useDropzone({
    onDrop: onDropRc,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png'] },
    multiple: false
  } as any);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleAnalyze = async () => {
    if (!valuationPdf) {
      setError("Please upload the Valuation Report.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const valBase64 = await fileToBase64(valuationPdf);
      const rcBase64 = rcImage ? await fileToBase64(rcImage) : undefined;
      const result = await analyzeDocuments(valBase64, rcBase64);
      setReport(result);
    } catch (err) {
      console.error(err);
      setError("Analysis failed. Please ensure the files are clear and try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadReceipt = () => {
    if (!report) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(20, 20, 20);
    doc.text('AutoQC: INSPECTION RECEIPT', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Case ID: QC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`, 14, 28);
    doc.text(`Date: ${new Date().toLocaleString()}`, 14, 33);

    // Summary Table
    (doc as any).autoTable({
      startY: 40,
      head: [['Field', 'Value']],
      body: [
        ['Vehicle', report.vehicleSummary.makeModel],
        ['Reg No', report.vehicleSummary.regNo],
        ['Valuation', report.marketAnalysis.reportedValuation],
        ['Verdict', report.finalVerdict],
      ],
      theme: 'striped',
      headStyles: { fillColor: [40, 40, 40] }
    });

    // Verification Matrix Table
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Checkpoint', 'Status', 'Remarks']],
      body: report.verificationMatrix.map(item => [item.check, item.status, item.remarks]),
      theme: 'grid',
      headStyles: { fillColor: [80, 80, 80] },
      styles: { fontSize: 8 }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 10;

    // Discrepancies observed
    const discrepancies = [
      ...(report.documentVerification.mismatches || []),
      ...(report.riskFlags || [])
    ];

    if (discrepancies.length > 0) {
      doc.setFontSize(12);
      doc.setTextColor(20, 20, 20);
      doc.text('Discrepancies Observed:', 14, currentY);
      doc.setFontSize(10);
      doc.setTextColor(180, 0, 0);
      discrepancies.forEach((d, i) => {
        const text = `- ${d}`;
        const splitText = doc.splitTextToSize(text, pageWidth - 28);
        doc.text(splitText, 14, currentY + 7 + (i * 5));
      });
      currentY += 10 + (discrepancies.length * 5);
    }

    // Remarks
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text('QC Remarks:', 14, currentY);
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const splitRemarks = doc.splitTextToSize(report.qcRemarks, pageWidth - 28);
    doc.text(splitRemarks, 14, currentY + 7);

    doc.save(`QC_Receipt_${report.vehicleSummary.regNo}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase italic">AutoQC</h1>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">AI Motor Insurance Surveyor v1.0</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-mono text-gray-400 uppercase">System Status</p>
              <div className="flex items-center gap-1 justify-end">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[11px] font-bold text-green-600 uppercase">Live Audit Ready</span>
              </div>
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Uploads */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <SectionHeader icon={Upload} title="Document Intake" />
              
              <div className="space-y-4">
                {/* Valuation Report Upload */}
                <div 
                  {...getValuationProps()} 
                  className={`border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer text-center ${
                    isValuationActive ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <input {...getValuationInput()} />
                  <div className="flex flex-col items-center gap-2">
                    {valuationPdf ? (
                      <>
                        <FileText className="w-8 h-8 text-gray-900" />
                        <span className="text-xs font-mono truncate w-full">{valuationPdf.name}</span>
                        <span className="text-[10px] text-green-600 font-bold uppercase">Ready</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-8 h-8 text-gray-300" />
                        <p className="text-[11px] text-gray-500">Drop Valuation Report (PDF)</p>
                      </>
                    )}
                  </div>
                </div>

                {/* RC Copy Upload */}
                <div 
                  {...getRcProps()} 
                  className={`border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer text-center ${
                    isRcActive ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <input {...getRcInput()} />
                  <div className="flex flex-col items-center gap-2">
                    {rcImage ? (
                      <>
                        <Camera className="w-8 h-8 text-gray-900" />
                        <span className="text-xs font-mono truncate w-full">{rcImage.name}</span>
                        <span className="text-[10px] text-green-600 font-bold uppercase">Ready</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-8 h-8 text-gray-300" />
                        <p className="text-[11px] text-gray-500">Drop RC Copy (Optional Image)</p>
                      </>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !valuationPdf}
                  className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Start QC Audit
                    </>
                  )}
                </button>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-red-600 font-medium leading-tight">{error}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats / Info */}
            <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-xl">
              <h4 className="text-[10px] font-mono text-gray-400 uppercase mb-4">Audit Intelligence</h4>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold">Fraud Detection</p>
                    <p className="text-[9px] text-gray-400">Active Chassis/VIN cross-check</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <Search className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold">Market Benchmarking</p>
                    <p className="text-[9px] text-gray-400">OLX, CarWale, OBV simulation</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Report */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {isAnalyzing ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white rounded-2xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center h-full min-h-[500px]"
                >
                  <div className="relative mb-6">
                    <div className="w-20 h-20 border-4 border-gray-100 rounded-full" />
                    <div className="absolute inset-0 border-4 border-gray-900 rounded-full border-t-transparent animate-spin" />
                    <ShieldCheck className="absolute inset-0 m-auto w-8 h-8 text-gray-900" />
                  </div>
                  <h2 className="text-xl font-black uppercase italic mb-2">Analyzing Assets</h2>
                  <p className="text-xs text-gray-500 max-w-xs font-mono">
                    Extracting vehicle specs, cross-referencing RC data, and simulating market valuation...
                  </p>
                </motion.div>
              ) : report ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  {/* Verdict Banner */}
                  <div className={`p-6 rounded-2xl border flex items-center justify-between gap-4 ${
                    report.finalVerdict === 'Recommended' ? 'bg-green-50 border-green-200' :
                    report.finalVerdict === 'Not Recommended' ? 'bg-red-50 border-red-200' :
                    'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex items-center gap-4">
                      {report.finalVerdict === 'Recommended' ? <CheckCircle2 className="w-10 h-10 text-green-600" /> :
                       report.finalVerdict === 'Not Recommended' ? <XCircle className="w-10 h-10 text-red-600" /> :
                       <AlertTriangle className="w-10 h-10 text-amber-600" />}
                      <div>
                        <h2 className="text-xl font-black uppercase italic leading-none">{report.finalVerdict}</h2>
                        <p className="text-[11px] text-gray-600 mt-1 font-medium">{report.justification}</p>
                      </div>
                    </div>
                    <button 
                      onClick={downloadReceipt}
                      className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
                      title="Download QC Receipt"
                    >
                      <Download className="w-5 h-5 text-gray-700" />
                    </button>
                  </div>

                  {/* Verification Matrix */}
                  <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <SectionHeader icon={ShieldCheck} title="Verification Matrix" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] font-mono">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400 text-left">
                            <th className="pb-2 font-medium">CHECKPOINT</th>
                            <th className="pb-2 font-medium">STATUS</th>
                            <th className="pb-2 font-medium">REMARKS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {report.verificationMatrix.map((item, i) => (
                            <tr key={i}>
                              <td className="py-2 text-gray-700">{item.check}</td>
                              <td className="py-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  item.status === 'Pass' ? 'bg-green-50 text-green-600' :
                                  item.status === 'Fail' ? 'bg-red-50 text-red-600' :
                                  item.status === 'Alert' ? 'bg-amber-50 text-amber-600' :
                                  'bg-gray-50 text-gray-400'
                                }`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="py-2 text-gray-500 italic">{item.remarks}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Report Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Summary */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <SectionHeader icon={Car} title="Vehicle Summary" />
                      <DataRow label="Make & Model" value={report.vehicleSummary.makeModel} />
                      <DataRow label="Reg No" value={report.vehicleSummary.regNo} />
                      <DataRow label="Fuel Type" value={report.vehicleSummary.fuelType} />
                      <DataRow label="Transmission" value={report.vehicleSummary.transmission} />
                      <DataRow label="KM Reading" value={report.vehicleSummary.kmReading} />
                      <DataRow label="Location" value={report.vehicleSummary.location} />
                    </div>

                    {/* Market Analysis */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <SectionHeader icon={Search} title="Market Analysis" />
                      <DataRow label="Lowest Price" value={report.marketAnalysis.lowestPrice} />
                      <DataRow label="Highest Price" value={report.marketAnalysis.highestPrice} />
                      <DataRow label="Average Price" value={report.marketAnalysis.averagePrice} />
                      <DataRow label="Reported Val" value={report.marketAnalysis.reportedValuation} status={report.marketAnalysis.status} />
                    </div>

                    {/* Document & Identity */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <SectionHeader icon={FileText} title="Identity & Docs" />
                      <DataRow label="RC Match" value={report.documentVerification.rcMatchStatus} status={report.documentVerification.rcMatchStatus} />
                      <DataRow label="Reg Match" value={report.identityVerification.registrationMatch} status={report.identityVerification.registrationMatch} />
                      <DataRow label="Chassis Match" value={report.identityVerification.chassisMatch} status={report.identityVerification.chassisMatch} />
                      <DataRow label="VIN Match" value={report.identityVerification.vinMatch} status={report.identityVerification.vinMatch} />
                      <DataRow label="Tampering" value={report.identityVerification.tamperingDetected} status={report.identityVerification.tamperingDetected} />
                    </div>

                    {/* Photo & Condition */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <SectionHeader icon={Camera} title="Photo & Condition" />
                      <DataRow label="Mandatory Photos" value={report.photoQC.mandatoryPhotos} status={report.photoQC.mandatoryPhotos} />
                      <DataRow label="Missing" value={report.photoQC.missingPhotos} />
                      <DataRow label="Visibility" value={report.photoQC.visibility} status={report.photoQC.visibility} />
                      <DataRow label="Tyre Condition" value={report.vehicleCondition.tyreCondition} />
                      <DataRow label="Damage Detected" value={report.vehicleCondition.damageDetected} />
                      <DataRow label="Missing Parts" value={report.vehicleCondition.missingParts} />
                    </div>
                  </div>

                  {/* Risk Flags */}
                  {report.riskFlags.length > 0 && (
                    <div className="bg-red-50 border border-red-100 p-6 rounded-2xl">
                      <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-red-700">Critical Risk Flags</h3>
                      </div>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {report.riskFlags.map((flag, i) => (
                          <li key={i} className="flex items-center gap-2 text-[11px] text-red-600 font-medium">
                            <div className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                            {flag}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Remarks */}
                  <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <SectionHeader icon={Info} title="QC Remarks" />
                    <p className="text-[11px] text-gray-600 font-mono leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100 italic">
                      "{report.qcRemarks}"
                    </p>
                  </div>
                </motion.div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-200 border-dashed p-12 flex flex-col items-center justify-center text-center h-full min-h-[500px]">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                    <FileText className="w-8 h-8 text-gray-300" />
                  </div>
                  <h2 className="text-xl font-black uppercase italic mb-2">Awaiting Audit</h2>
                  <p className="text-xs text-gray-400 max-w-xs font-mono">
                    Upload the valuation report and RC copy to begin the automated quality control process.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-mono text-gray-400 uppercase">© 2026 AutoQC Systems • Secured Audit Environment</p>
          <div className="flex gap-6">
            <a href="#" className="text-[10px] font-bold text-gray-400 uppercase hover:text-gray-900 transition-colors">Documentation</a>
            <a href="#" className="text-[10px] font-bold text-gray-400 uppercase hover:text-gray-900 transition-colors">Privacy Policy</a>
            <a href="#" className="text-[10px] font-bold text-gray-400 uppercase hover:text-gray-900 transition-colors">Support</a>
          </div>
        </footer>
      </div>
    </div>
  );
}

