import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const HumanizerTool = () => {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  const humanizeText = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter some text to humanize");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setOutputText("");

    // Simulate processing with progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    // Simulate API call
    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      
      // Mock humanized output
      const humanized = inputText
        .replace(/\b(Additionally|Furthermore|Moreover|Therefore|Consequently)\b/gi, (match) => {
          const alternatives = ["Also", "Plus", "And", "So", "As a result"];
          return alternatives[Math.floor(Math.random() * alternatives.length)];
        })
        .replace(/\b(utilize|utilization)\b/gi, "use")
        .replace(/\b(commence|initiate)\b/gi, "start")
        .replace(/\b(terminate|conclude)\b/gi, "end")
        .replace(/\b(demonstrate|indicate)\b/gi, "show");
      
      setOutputText(humanized);
      setIsProcessing(false);
      toast.success("Text successfully humanized!");
    }, 2200);
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
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground">
              Processing your text... {progress}%
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
