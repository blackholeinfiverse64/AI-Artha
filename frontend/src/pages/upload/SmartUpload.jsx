import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  X,
  FileText,
  FileSpreadsheet,
  Image,
  CheckCircle,
  AlertCircle,
  Loader2,
  Zap,
  Receipt,
  CreditCard,
  ArrowRight,
  ShieldCheck,
  Clock,
  IndianRupee,
  CalendarDays,
  Tag,
  Store,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Card, Button } from '../../components/common';
import api from '../../services/api';

const FILE_TYPE_ICONS = {
  'image/jpeg': Image,
  'image/png': Image,
  'image/jpg': Image,
  'image/webp': Image,
  'application/pdf': FileText,
  'text/csv': FileSpreadsheet,
  'application/vnd.ms-excel': FileSpreadsheet,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileSpreadsheet,
};

const TYPE_COLORS = {
  bank_statement: 'bg-blue-500/10 text-blue-600 border-blue-200',
  bill: 'bg-amber-500/10 text-amber-600 border-amber-200',
  receipt: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
};

const TYPE_LABELS = {
  bank_statement: 'Bank Statement',
  bill: 'Bill / Invoice',
  receipt: 'Receipt / Expense',
};

const SmartUpload = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [expandedCards, setExpandedCards] = useState({});
  const [approvingIds, setApprovingIds] = useState(new Set());
  const [approvedIds, setApprovedIds] = useState(new Set());

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const addFiles = (newFiles) => {
    const valid = newFiles.filter((f) => {
      const ext = f.name.split('.').pop().toLowerCase();
      const validExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'csv', 'xls', 'xlsx'];
      return validExt.includes(ext) && f.size <= 25 * 1024 * 1024;
    });
    if (valid.length < newFiles.length) {
      toast.error('Some files were skipped (unsupported type or > 25MB)');
    }
    setFiles((prev) => [...prev, ...valid].slice(0, 10));
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getFileTypeLabel = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['csv', 'xls', 'xlsx'].includes(ext)) return 'Bank Statement';
    if (ext === 'pdf') return 'PDF Document';
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'Receipt / Bill';
    return 'Document';
  };

  const getFileIcon = (file) => FILE_TYPE_ICONS[file.type] || FileText;

  const toggleCard = (index) => {
    setExpandedCards((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  /* ── Upload ────────────────────────────────────────── */
  const handleUploadAll = async () => {
    if (files.length === 0) return toast.error('Please add at least one file');

    setUploading(true);
    setResults([]);
    setApprovedIds(new Set());
    const uploadResults = [];

    for (let i = 0; i < files.length; i++) {
      setCurrentIndex(i);
      try {
        const formData = new FormData();
        formData.append('file', files[i]);
        const response = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploadResults.push({ fileName: files[i].name, success: true, data: response.data.data });
      } catch (err) {
        uploadResults.push({
          fileName: files[i].name,
          success: false,
          error: err.response?.data?.message || err.message,
        });
      }
    }

    setResults(uploadResults);
    setCurrentIndex(-1);
    setUploading(false);

    const expanded = {};
    uploadResults.forEach((_, i) => { expanded[i] = true; });
    setExpandedCards(expanded);

    const ok = uploadResults.filter((r) => r.success).length;
    toast.success(ok === uploadResults.length
      ? `All ${ok} files processed!`
      : `${ok} of ${uploadResults.length} files processed`);
  };

  /* ── Approve single expense ──────────────────────── */
  const handleApprove = async (expenseId, index) => {
    setApprovingIds((prev) => new Set([...prev, expenseId]));
    try {
      await api.post(`/expenses/${expenseId}/approve`);
      setApprovedIds((prev) => new Set([...prev, expenseId]));
      setResults((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, data: { ...r.data, summary: { ...r.data.summary, status: 'approved' } } } : r
        )
      );
      toast.success('Expense approved — all numbers updated!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approval failed');
    } finally {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        next.delete(expenseId);
        return next;
      });
    }
  };

  /* ── Approve ALL pending ──────────────────────────── */
  const handleApproveAll = async () => {
    const pendingItems = results
      .map((r, i) => ({ result: r, index: i }))
      .filter(({ result }) =>
        result.success &&
        result.data?.summary?.expenseId &&
        result.data?.summary?.status !== 'approved' &&
        !approvedIds.has(result.data.summary.expenseId)
      );

    if (pendingItems.length === 0) return toast('Nothing to approve');

    for (const { result, index } of pendingItems) {
      await handleApprove(result.data.summary.expenseId, index);
    }
  };

  const hasResults = results.length > 0;
  const pendingCount = results.filter(
    (r) => r.success && r.data?.summary?.expenseId && r.data?.summary?.status !== 'approved' && !approvedIds.has(r.data.summary.expenseId)
  ).length;
  const approvedCount = results.filter(
    (r) => r.success && (r.data?.summary?.status === 'approved' || approvedIds.has(r.data?.summary?.expenseId))
  ).length;
  const statementsCount = results.filter((r) => r.success && r.data?.documentType === 'bank_statement').length;
  const expensesCount = results.filter(
    (r) => r.success && (r.data?.documentType === 'receipt' || r.data?.documentType === 'bill')
  ).length;
  const totalAmount = results
    .filter((r) => r.success && r.data?.summary?.amount)
    .reduce((sum, r) => sum + parseFloat(r.data.summary.amount || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Smart Upload"
        description="Drop any document — bills, receipts, bank statements — see extracted content below, then approve to update all numbers"
      />

      {/* ── Upload Zone ──────────────────────────────────── */}
      <Card>
        <div
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${
            dragActive ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Upload className="w-7 h-7 text-primary" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Drop any file here</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Bank statements (CSV, Excel, PDF) &bull; Bills &amp; receipts (images, PDF) &bull; Up to 10 files
          </p>
          <label className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium cursor-pointer hover:bg-primary/90 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20">
            <Upload className="w-4 h-4" />
            Browse Files
            <input
              type="file"
              className="hidden"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,.csv,.xls,.xlsx"
              onChange={(e) => addFiles(Array.from(e.target.files))}
            />
          </label>
        </div>

        {/* File chips */}
        {files.length > 0 && !hasResults && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Files ({files.length})</h4>
              {!uploading && (
                <button onClick={() => setFiles([])} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                  Clear all
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {files.map((file, index) => {
                const FileIcon = getFileIcon(file);
                const isProcessing = uploading && index === currentIndex;
                return (
                  <div
                    key={index}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                      isProcessing ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/30'
                    }`}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : (
                      <FileIcon className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-foreground max-w-[140px] truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)}KB</span>
                    {!uploading && (
                      <button onClick={() => removeFile(index)} className="ml-1 hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <Button onClick={handleUploadAll} disabled={uploading || files.length === 0} className="w-full">
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing {currentIndex + 1} of {files.length}...</>
              ) : (
                <><Zap className="w-4 h-4" /> Process All Files ({files.length})</>
              )}
            </Button>
          </div>
        )}
      </Card>

      {/* ── Results: Counters ────────────────────────────── */}
      {hasResults && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Processed', value: results.filter((r) => r.success).length, icon: CheckCircle, color: 'text-success' },
            { label: 'Expenses Created', value: expensesCount, icon: Receipt, color: 'text-amber-500' },
            { label: 'Statements', value: statementsCount, icon: CreditCard, color: 'text-blue-500' },
            { label: 'Total Amount', value: `₹${totalAmount.toLocaleString('en-IN')}`, icon: IndianRupee, color: 'text-emerald-500' },
          ].map((stat) => (
            <Card key={stat.label} className="!p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold text-foreground">{stat.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Approve All Bar ──────────────────────────────── */}
      {hasResults && pendingCount > 0 && (
        <Card className="!p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {pendingCount} item{pendingCount !== 1 ? 's' : ''} pending approval
                </p>
                <p className="text-xs text-muted-foreground">
                  Approve to finalize expenses &amp; update all dashboard numbers
                </p>
              </div>
            </div>
            <Button onClick={handleApproveAll} className="gap-2">
              <ShieldCheck className="w-4 h-4" />
              Approve All ({pendingCount})
            </Button>
          </div>
        </Card>
      )}

      {/* ── All approved banner ──────────────────────────── */}
      {hasResults && pendingCount === 0 && approvedCount > 0 && (
        <Card className="!p-4 border-success/20 bg-success/5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-success" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                All {approvedCount} expense{approvedCount !== 1 ? 's' : ''} approved
              </p>
              <p className="text-xs text-muted-foreground">
                Dashboard totals, reports &amp; ledger have been updated
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Extracted Content Cards ──────────────────────── */}
      {hasResults && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Extracted Content</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setFiles([]); setResults([]); setApprovedIds(new Set()); }}
              >
                Upload More
              </Button>
              <Button size="sm" onClick={() => navigate('/dashboard')}>
                Dashboard
              </Button>
            </div>
          </div>

          {results.map((result, index) => {
            const isExpanded = expandedCards[index];
            const d = result.data;
            const summary = d?.summary || {};
            const isStatement = d?.documentType === 'bank_statement';
            const isExpense = d?.documentType === 'receipt' || d?.documentType === 'bill';
            const expenseId = summary.expenseId;
            const isApproved = summary.status === 'approved' || approvedIds.has(expenseId);
            const isApproving = approvingIds.has(expenseId);

            return (
              <Card
                key={index}
                className={`overflow-hidden transition-all duration-300 ${
                  !result.success ? 'border-destructive/20' : isApproved ? 'border-success/30' : 'border-border'
                }`}
              >
                {/* Header row */}
                <div
                  className="flex items-center gap-4 cursor-pointer select-none"
                  onClick={() => toggleCard(index)}
                >
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    {!result.success ? (
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    ) : isApproved ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : isStatement ? (
                      <CreditCard className="w-5 h-5 text-blue-500" />
                    ) : (
                      <Receipt className="w-5 h-5 text-amber-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">{result.fileName}</p>
                      {d?.documentType && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase border ${TYPE_COLORS[d.documentType] || 'bg-muted text-muted-foreground border-border'}`}>
                          {TYPE_LABELS[d.documentType] || d.documentType}
                        </span>
                      )}
                      {isApproved && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase bg-success/10 text-success border border-success/20">
                          Approved
                        </span>
                      )}
                      {isExpense && !isApproved && result.success && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase bg-amber-500/10 text-amber-600 border border-amber-200">
                          Pending
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {result.success ? summary.message : result.error}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isExpense && summary.amount && (
                      <span className="text-base font-bold text-foreground">
                        ₹{parseFloat(summary.amount).toLocaleString('en-IN')}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && result.success && (
                  <div className="mt-4 pt-4 border-t border-border">
                    {/* ── Expense / Bill detail ── */}
                    {isExpense && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          <DetailField icon={Store} label="Vendor" value={summary.vendor} />
                          <DetailField icon={IndianRupee} label="Amount" value={summary.amount ? `₹${parseFloat(summary.amount).toLocaleString('en-IN')}` : '—'} highlight />
                          <DetailField icon={IndianRupee} label="Tax / GST" value={summary.taxAmount ? `₹${parseFloat(summary.taxAmount).toLocaleString('en-IN')}` : '₹0'} />
                          <DetailField icon={CalendarDays} label="Date" value={summary.date ? new Date(summary.date).toLocaleDateString('en-IN') : '—'} />
                          <DetailField icon={Tag} label="Expense #" value={summary.expenseNumber || '—'} />
                          <DetailField
                            icon={Clock}
                            label="Status"
                            value={isApproved ? 'Approved' : 'Pending Approval'}
                            valueClass={isApproved ? 'text-success' : 'text-amber-500'}
                          />
                          {summary.ocrConfidence && (
                            <DetailField icon={Eye} label="OCR Confidence" value={`${Math.round(summary.ocrConfidence)}%`} />
                          )}
                        </div>

                        {/* Actions */}
                        {d?.actions?.map((action, ai) => (
                          <div key={ai} className="flex items-start gap-2 text-xs bg-muted/40 rounded-lg p-2.5">
                            {action.type === 'ocr_completed' ? (
                              <Eye className="w-3.5 h-3.5 text-info mt-0.5 flex-shrink-0" />
                            ) : action.type === 'expense_created' ? (
                              <CheckCircle className="w-3.5 h-3.5 text-success mt-0.5 flex-shrink-0" />
                            ) : (
                              <Zap className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                            )}
                            <span className="text-muted-foreground">{action.message}</span>
                          </div>
                        ))}

                        {/* Approve / View button */}
                        <div className="flex gap-3 pt-1">
                          {!isApproved && expenseId && (
                            <Button
                              onClick={(e) => { e.stopPropagation(); handleApprove(expenseId, index); }}
                              disabled={isApproving}
                              className="gap-2"
                            >
                              {isApproving ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
                              ) : (
                                <><ShieldCheck className="w-4 h-4" /> Approve Expense</>
                              )}
                            </Button>
                          )}
                          {expenseId && (
                            <Button variant="outline" onClick={(e) => { e.stopPropagation(); navigate('/expenses'); }}>
                              <Eye className="w-4 h-4" /> View Expenses
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Bank Statement detail ── */}
                    {isStatement && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <DetailField icon={CreditCard} label="Statement #" value={summary.statementNumber || '—'} />
                          <DetailField icon={Clock} label="Status" value={summary.status === 'processing' ? 'Processing...' : summary.status} valueClass="text-blue-500" />
                        </div>

                        {d?.actions?.map((action, ai) => (
                          <div key={ai} className="flex items-start gap-2 text-xs bg-muted/40 rounded-lg p-2.5">
                            <Zap className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{action.message}</span>
                          </div>
                        ))}

                        <p className="text-xs text-muted-foreground">
                          Auto-reconciliation running in background — matching invoices, creating expenses, posting to ledger.
                        </p>

                        {summary.statementId && (
                          <Button
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); navigate(`/statements/${summary.statementId}`); }}
                            className="gap-2"
                          >
                            <ArrowRight className="w-4 h-4" /> View Statement Details
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Empty state with how-it-works ─────────────── */}
      {!hasResults && files.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Upload, title: '1. Drop any file', desc: 'Images, PDFs, CSV, Excel — all formats accepted' },
            { icon: Zap, title: '2. Auto-detect', desc: 'System identifies bank statement vs bill vs receipt' },
            { icon: Receipt, title: '3. Extract data', desc: 'OCR reads vendor, amount, date, GST. CSV/Excel parsed for transactions' },
            { icon: ShieldCheck, title: '4. Approve & update', desc: 'Review extracted content, approve, and all numbers update everywhere' },
          ].map((step, i) => (
            <Card key={i} className="!p-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <step.icon className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">{step.title}</p>
              <p className="text-xs text-muted-foreground">{step.desc}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const DetailField = ({ icon: Icon, label, value, highlight, valueClass }) => (
  <div className="flex items-start gap-2.5 p-3 bg-muted/40 rounded-xl">
    <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className={`text-sm font-semibold truncate ${valueClass || (highlight ? 'text-primary' : 'text-foreground')}`}>
        {value || '—'}
      </p>
    </div>
  </div>
);

export default SmartUpload;
