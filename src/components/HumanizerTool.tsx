import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Copy, Check, Upload, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const HumanizerTool = () => {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [examples, setExamples] = useState<{ name: string; content: string }[]>([]);
  const [isParsingFiles, setIsParsingFiles] = useState(false);
  const [detection, setDetection] = useState<any | null>(null);
  const [documentType, setDocumentType] = useState<string | null>(null);
  const [qaMetrics, setQaMetrics] = useState<any | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsParsingFiles(true);
    const newExamples: { name: string; content: string }[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Save file temporarily
        const tempPath = `user-uploads://${file.name}`;
        const formData = new FormData();
        formData.append('file', file);

        // Parse the document
        toast.info(`Parsing ${file.name}...`);
        
        // For now, read as text for simple files, we'll need to add proper parsing
        const text = await file.text();
        newExamples.push({
          name: file.name,
          content: text.substring(0, 5000) // Limit to 5000 chars per example
        });
      }

      setExamples([...examples, ...newExamples]);
      toast.success(`Added ${newExamples.length} example(s)`);
    } catch (error) {
      console.error('Error parsing files:', error);
      toast.error("Failed to parse some files");
    } finally {
      setIsParsingFiles(false);
      event.target.value = ''; // Reset input
    }
  };

  const removeExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
    toast.success("Example removed");
  };

  const humanizeText = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter some text to humanize");
      return;
    }

    setIsProcessing(true);
    setOutputText("");

    try {
      const examplesText = examples.length > 0 
        ? examples.map(ex => ex.content).join('\n\n---\n\n')
        : '';

      const { data, error } = await supabase.functions.invoke('humanize-text', {
        body: { 
          text: inputText,
          examples: examplesText
        }
      });

      if (error) {
        console.error('Error humanizing text:', error);
        toast.error(error.message || "Failed to humanize text. Please try again.");
        setIsProcessing(false);
        return;
      }

      setOutputText(data.humanizedText);
      setDetection(data.detection || null);
      setDocumentType(data.documentType || null);
      setQaMetrics(data.qaMetrics || null);
      setIsProcessing(false);
      toast.success("Text humanized successfully!");
    } catch (error) {
      console.error('Error:', error);
      toast.error("An error occurred. Please try again.");
      setIsProcessing(false);
    }
  };

  const copyToClipboard = async () => {
    if (outputText) {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-12">
      {/* Examples Upload Section */}
      <Card className="p-6 mb-6 bg-card border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Training Examples</h3>
            <p className="text-sm text-muted-foreground">Upload PDFs or text files for the AI to analyze</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('file-upload')?.click()}
            disabled={isParsingFiles}
          >
            {isParsingFiles ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload Files
          </Button>
          <input
            id="file-upload"
            type="file"
            multiple
            accept=".pdf,.txt,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
        
        {examples.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {examples.map((example, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-3 py-2 bg-background rounded-md border border-border"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{example.name}</span>
                <button
                  onClick={() => removeExample(index)}
                  className="ml-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {examples.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No examples added yet. Upload files to improve humanization quality.
          </p>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">AI-Generated Text</h3>
            <span className="text-sm text-muted-foreground">
              {inputText.length} characters
            </span>
          </div>
          <Textarea
            placeholder="Paste your AI-generated text here..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[400px] resize-none bg-background border-border text-foreground placeholder:text-muted-foreground"
          />
        </Card>

        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Humanized Text</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyToClipboard}
              disabled={!outputText}
              className="text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Document Type and QA Metrics */}
          {(documentType || qaMetrics) && (
            <div className="mb-4 p-4 bg-muted/50 rounded-lg space-y-3">
              {documentType && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Document Type:</span>
                  <span className="text-sm text-muted-foreground capitalize">
                    {documentType.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
              
              {qaMetrics && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">QA Metrics:</span>
                    <span className={`text-sm font-semibold ${qaMetrics.passed ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                      {qaMetrics.passed ? '✓ All Passed' : '⚠ Some Issues'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className={`p-2 rounded ${qaMetrics.metrics.contractionDensity.passed ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'}`}>
                      <div className="font-medium">Contractions</div>
                      <div>{qaMetrics.metrics.contractionDensity.value}%</div>
                    </div>
                    
                    <div className={`p-2 rounded ${qaMetrics.metrics.fragmentRatio.passed ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'}`}>
                      <div className="font-medium">Fragments</div>
                      <div>{qaMetrics.metrics.fragmentRatio.value}%</div>
                    </div>
                    
                    <div className={`p-2 rounded ${qaMetrics.metrics.sentenceLengthSD.passed ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'}`}>
                      <div className="font-medium">Length SD</div>
                      <div>{qaMetrics.metrics.sentenceLengthSD.value}</div>
                    </div>
                    
                    <div className={`p-2 rounded ${qaMetrics.metrics.activeVoicePercent.passed ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'}`}>
                      <div className="font-medium">Active Voice</div>
                      <div>{qaMetrics.metrics.activeVoicePercent.value}%</div>
                    </div>
                    
                    <div className={`p-2 rounded ${qaMetrics.metrics.aiMarkerCount.passed ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'}`}>
                      <div className="font-medium">AI Markers</div>
                      <div>{qaMetrics.metrics.aiMarkerCount.value}</div>
                    </div>
                    
                    <div className={`p-2 rounded ${qaMetrics.metrics.vocabularyRepetition.passed ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'}`}>
                      <div className="font-medium">Vocab Rep</div>
                      <div>{qaMetrics.metrics.vocabularyRepetition.value}</div>
                    </div>
                    
                    <div className={`p-2 rounded ${qaMetrics.metrics.emotionalAnchoring.passed ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'}`}>
                      <div className="font-medium">Emotion</div>
                      <div>{qaMetrics.metrics.emotionalAnchoring.value}%</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <Textarea
            placeholder="Your humanized text will appear here..."
            value={outputText}
            readOnly
            className="min-h-[400px] resize-none bg-background border-border text-foreground placeholder:text-muted-foreground"
          />
        </Card>
      </div>

      {detection && (
        <Card className="mt-6 p-6 bg-card border-border">
          <h3 className="text-lg font-semibold text-foreground mb-2">AI Detection Report</h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm text-foreground">
            <div>
              <p className="text-muted-foreground mb-1">Initial Scores</p>
              <p>Average: {detection.initial?.average?.toFixed ? detection.initial.average.toFixed(2) : detection.initial?.average}%</p>
              <p>Sapling: {detection.initial?.sapling != null ? detection.initial.sapling.toFixed(2) : 'N/A'}%</p>
              <p>ZeroGPT: {detection.initial?.zerogpt != null ? detection.initial.zerogpt.toFixed(2) : 'N/A'}%</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">After Refinement</p>
              {detection.refinementApplied && detection.refined ? (
                <>
                  <p>Average: {detection.refined.average?.toFixed ? detection.refined.average.toFixed(2) : detection.refined.average}%</p>
                  <p>Sapling: {detection.refined.sapling != null ? detection.refined.sapling.toFixed(2) : 'N/A'}%</p>
                  <p>ZeroGPT: {detection.refined.zerogpt != null ? detection.refined.zerogpt.toFixed(2) : 'N/A'}%</p>
                </>
              ) : (
                <p>No refinement applied (score below threshold).</p>
              )}
            </div>
          </div>
          {Array.isArray(detection.flaggedSections) && detection.flaggedSections.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">Flagged Sentences ({detection.flaggedSections.length})</p>
              <div className="space-y-2 max-h-48 overflow-auto pr-2">
                {detection.flaggedSections.map((s: any, i: number) => (
                  <div key={i} className="p-2 rounded-md border border-border bg-background">
                    <p className="text-xs">Score: {s.score?.toFixed ? s.score.toFixed(1) : s.score}%</p>
                    <p className="text-xs mt-1 text-foreground/90">{s.sentence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}


      <div className="mt-8 text-center space-y-4">
        {isProcessing && (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Processing your text...
            </p>
          </div>
        )}
        
        <Button
          onClick={humanizeText}
          disabled={isProcessing || !inputText.trim()}
          size="lg"
          className="px-8 py-6 text-lg gradient-primary hover:opacity-90 transition-opacity shadow-elegant"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Humanizing...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Humanize Text
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default HumanizerTool;
