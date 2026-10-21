import { Link, useLocation } from "react-router-dom";
import { getRole } from "./api";

export const demoSteps = [
  { name: "Overview", path: "/overview", icon: "grid", routes: ["/overview"] },
  { name: "Monitoring", path: "/pipeline", icon: "layers", routes: ["/pipeline"] },
  { name: "Model training", path: "/training", icon: "flask", routes: ["/training", "/evaluation", "/models", "/datasets"] },
  { name: "Anomaly detection", path: "/demo", icon: "shield", routes: ["/demo", "/inference", "/incidents"] },
  { name: "Rescue", path: "/response", icon: "check", routes: ["/response"] },
] as const;

export function DemoFlow() {
  const { pathname } = useLocation();
  const responder = getRole() === "responder";

  return (
    <nav className="demo-flow" aria-label="Demo flow">
      <ol>
        {demoSteps.map((step, index) => {
          const active = responder
            ? step.path === "/response"
            : step.routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
          const content = <>{active && <span className="demo-step-indicator" aria-hidden="true" />}<span className="demo-step-number" aria-hidden="true">{index + 1}</span><span>{step.name}</span></>;
          return (
            <li key={step.path}>
              {responder && step.path !== "/response" ? (
                <span className="demo-step" aria-disabled="true">{content}</span>
              ) : (
                <Link className="demo-step" to={step.path} viewTransition aria-label={step.name} aria-current={active ? "step" : undefined}>{content}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
