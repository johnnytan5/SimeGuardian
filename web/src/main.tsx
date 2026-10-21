import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, redirect, RouterProvider } from "react-router-dom";
import App from "./App";
import { getRole } from "./api";
import "./styles.css";

const router = createBrowserRouter([
  { path: "/", loader: () => redirect(getRole() === "responder" ? "/response" : "/overview") },
  { path: "*", element: <App /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
