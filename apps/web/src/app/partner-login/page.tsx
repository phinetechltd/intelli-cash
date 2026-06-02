import React from "react";
import { LoginExperience } from "../../components/login-experience";

export default function PartnerLoginPage() {
  return (
    <LoginExperience
      ariaLabel="Intelli Cash partner access"
      copyText="Partner and lender access for green enterprise finance, wallets, impact reporting, portfolio visibility, and programme-backed services."
      copyTitle="Partner finance access"
      demoRoles={["PARTNER_OFFICER", "LENDER"]}
      formTitle="Partner sign in"
    />
  );
}
