import {BaseModel} from "../../utils/model.util";

export interface User extends BaseModel {
  email: string;
  display_name: string;
  role: "admin" | "landlord" | "assistant";
  qr_payment_url?: string;
}
