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
        toast.error("Failed to humanize text. Please try again.");
        setIsProcessing(false);
        return;
      }

      setOutputText(data.humanizedText);
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
          <Textarea
            placeholder="Your humanized text will appear here..."
            value={outputText}
            readOnly
            className="min-h-[400px] resize-none bg-background border-border text-foreground placeholder:text-muted-foreground"
          />
        </Card>
      </div>

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
