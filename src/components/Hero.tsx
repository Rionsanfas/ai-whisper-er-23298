import { Sparkles } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative py-20 px-4 overflow-hidden">
      <div className="absolute inset-0 gradient-shine animate-gradient opacity-10" />
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">100% Human Detection Score</span>
        </div>
        
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
          Transform AI Writing to{" "}
          <span className="gradient-text">100% Human</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
          Make your essays and research papers undetectable by AI detection tools. 
          Get authentic, human-like writing every time.
        </p>

        <div className="flex flex-wrap justify-center gap-8 mt-12">
          <div className="text-center">
            <div className="text-4xl font-bold gradient-text mb-2">100%</div>
            <div className="text-sm text-muted-foreground">Human Score</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold gradient-text mb-2">10K+</div>
            <div className="text-sm text-muted-foreground">Papers Humanized</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold gradient-text mb-2">5 Min</div>
            <div className="text-sm text-muted-foreground">Average Time</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
