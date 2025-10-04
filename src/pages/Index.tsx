import Hero from "@/components/Hero";
import HumanizerTool from "@/components/HumanizerTool";
import Features from "@/components/Features";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Hero />
      <HumanizerTool />
      <Features />
      
      <footer className="py-8 px-4 border-t border-border mt-20">
        <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
          <p>© 2025 AI Humanizer. Transform your AI writing to 100% human.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
