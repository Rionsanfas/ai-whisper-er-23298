import { Shield, Zap, Lock, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";

const features = [
  {
    icon: Shield,
    title: "AI Detection Bypass",
    description: "Passes all major AI detection tools including GPTZero, Turnitin, and Originality.ai",
  },
  {
    icon: Zap,
    title: "Instant Results",
    description: "Get your humanized text in seconds. No waiting, no hassle.",
  },
  {
    icon: Lock,
    title: "Privacy First",
    description: "Your content is processed securely and never stored on our servers.",
  },
  {
    icon: CheckCircle2,
    title: "Quality Guaranteed",
    description: "Maintains the original meaning while making it sound naturally human.",
  },
];

const Features = () => {
  return (
    <section className="py-20 px-4 bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Why Choose Our <span className="gradient-text">Humanizer</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            The most advanced AI text humanizer that ensures your content passes all detection tests
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="p-6 bg-card border-border hover:shadow-elegant transition-shadow duration-300"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg gradient-primary">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
