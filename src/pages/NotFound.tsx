import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="text-xl text-muted-foreground">Page not found</p>
      <Link to="/">
        <Button className="gap-2">
          <Home className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
};

export default NotFound;
