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

const SmartUpload = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

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

  const getFileIcon = (file) => {
    const Icon = FILE_TYPE_ICONS[file.type] || FileText;
    return Icon;
  };

  const handleUploadAll = async () => {
    if (files.length === 0) {
      toast.error('Please add at least one file');
      return;
    }

    setUploading(true);
    setResults([]);
    const uploadResults = [];

    for (let i = 0; i < files.length; i++) {
      setCurrentIndex(i);
      try {
        const formData = new FormData();
        formData.append('file', files[i]);

        const response = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        uploadResults.push({
          fileName: files[i].name,
          success: true,
          data: response.data.data,
        });
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

    const successCount = uploadResults.filter((r) => r.success).length;
    if (successCount === uploadResults.length) {
      toast.success(`All ${successCount} files processed successfully!`);
    } else {
      toast.success(`${successCount} of ${uploadResults.length} files processed`);
    }
  };

  const hasResults = results.length > 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Smart Upload"
        description="Drop any document — bills, receipts, bank statements, invoices — and everything updates automatically"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Area */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ${
                dragActive
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : 'border-border hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Drop any file here
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Bank statements (CSV, Excel, PDF) &bull; Bills &amp; receipts (images, PDF) &bull; Up to 10 files
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium cursor-pointer hover:bg-primary/90 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20">
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

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">
                    Files ({files.length})
                  </h4>
                  {!uploading && (
                    <button
                      onClick={() => setFiles([])}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {files.map((file, index) => {
                  const FileIcon = getFileIcon(file);
                  const isProcessing = uploading && index === currentIndex;
                  const isDone = uploading && index < currentIndex;
                  const result = results[index];

                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${
                        isProcessing
                          ? 'border-primary/50 bg-primary/5'
                          : result?.success
                            ? 'border-success/30 bg-success/5'
                            : result && !result.success
                              ? 'border-destructive/30 bg-destructive/5'
                              : 'border-border bg-muted/30'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        {isProcessing ? (
                          <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        ) : result?.success ? (
                          <CheckCircle className="w-5 h-5 text-success" />
                        ) : result && !result.success ? (
                          <AlertCircle className="w-5 h-5 text-destructive" />
                        ) : (
                          <FileIcon className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{(file.size / 1024).toFixed(1)} KB</span>
                          <span>&bull;</span>
                          <span className="text-primary font-medium">
                            {result?.data?.documentType
                              ? result.data.documentType.replace('_', ' ')
                              : getFileTypeLabel(file)}
                          </span>
                        </div>
                        {result?.data?.summary?.message && (
                          <p className="text-xs text-success mt-1 truncate">
                            {result.data.summary.message}
                          </p>
                        )}
                        {result?.error && (
                          <p className="text-xs text-destructive mt-1">{result.error}</p>
                        )}
                      </div>

                      {!uploading && !hasResults && (
                        <button
                          onClick={() => removeFile(index)}
                          className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                      )}

                      {result?.data?.documentType === 'bank_statement' && result?.data?.summary?.statementId && (
                        <button
                          onClick={() => navigate(`/statements/${result.data.summary.statementId}`)}
                          className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                          title="View statement"
                        >
                          <ArrowRight className="w-4 h-4 text-primary" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Upload Button */}
                {!hasResults && (
                  <Button
                    onClick={handleUploadAll}
                    disabled={uploading || files.length === 0}
                    className="w-full mt-4"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing {currentIndex + 1} of {files.length}...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Process All Files ({files.length})
                      </>
                    )}
                  </Button>
                )}

                {/* Upload More */}
                {hasResults && (
                  <div className="flex gap-3 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFiles([]);
                        setResults([]);
                      }}
                      className="flex-1"
                    >
                      Upload More
                    </Button>
                    <Button
                      onClick={() => navigate('/dashboard')}
                      className="flex-1"
                    >
                      Go to Dashboard
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Right panel — Info */}
        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-foreground mb-4">How it works</h3>
            <div className="space-y-4">
              {[
                {
                  icon: Upload,
                  title: 'Drop any file',
                  desc: 'Images, PDFs, CSV, Excel — we accept all formats',
                },
                {
                  icon: Zap,
                  title: 'Auto-detect type',
                  desc: 'System identifies if it\'s a bank statement, bill, or receipt',
                },
                {
                  icon: Receipt,
                  title: 'Extract data',
                  desc: 'OCR reads vendor, amount, date, GST from receipts. CSV/Excel parsed for transactions',
                },
                {
                  icon: CreditCard,
                  title: 'Update everything',
                  desc: 'Expenses created, invoices matched, payments recorded, ledger updated',
                },
              ].map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <step.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">Supported formats</h3>
            <div className="space-y-2">
              {[
                { ext: 'CSV, XLS, XLSX', label: 'Bank Statements', color: 'text-info' },
                { ext: 'JPG, PNG, WebP', label: 'Receipts & Bills', color: 'text-success' },
                { ext: 'PDF', label: 'Statements, Bills, Invoices', color: 'text-warning' },
              ].map((fmt) => (
                <div key={fmt.ext} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <span className="text-xs font-mono text-muted-foreground">{fmt.ext}</span>
                  <span className={`text-xs font-medium ${fmt.color}`}>{fmt.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Results Summary */}
          {hasResults && (
            <Card className="border-success/20">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-success" />
                Processing Complete
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total files</span>
                  <span className="font-medium text-foreground">{results.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Successful</span>
                  <span className="font-medium text-success">{results.filter(r => r.success).length}</span>
                </div>
                {results.some(r => !r.success) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Failed</span>
                    <span className="font-medium text-destructive">{results.filter(r => !r.success).length}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expenses created</span>
                  <span className="font-medium text-foreground">
                    {results.filter(r => r.data?.documentType === 'receipt' || r.data?.documentType === 'bill').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Statements processed</span>
                  <span className="font-medium text-foreground">
                    {results.filter(r => r.data?.documentType === 'bank_statement').length}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default SmartUpload;
