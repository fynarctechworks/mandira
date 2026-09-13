"use client";

import { Button } from "@mandhira/ui/components/ui/button";
import { Calendar } from "@mandhira/ui/components/ui/calendar";
import { Checkbox } from "@mandhira/ui/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@mandhira/ui/components/ui/field";
import { Input } from "@mandhira/ui/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@mandhira/ui/components/ui/input-group";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@mandhira/ui/components/ui/input-otp";
import { Label } from "@mandhira/ui/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@mandhira/ui/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mandhira/ui/components/ui/select";
import { Slider } from "@mandhira/ui/components/ui/slider";
import { Switch } from "@mandhira/ui/components/ui/switch";
import { Textarea } from "@mandhira/ui/components/ui/textarea";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { Section, Specimen } from "./shell";

const TIERS = ["Fixed", "Protected", "Important", "Optional"] as const;

export function Forms() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <Section
      id="forms"
      title="Forms & inputs"
      summary="Input, Textarea, Field, Checkbox, Radio, Switch, Slider, Select, NativeSelect, InputGroup, InputOTP and Calendar."
    >
      <Specimen name="Input & Textarea" className="block space-y-3">
        <Input placeholder="Where are you going?" />
        <Input placeholder="Disabled" disabled />
        <Input placeholder="Needs a value" aria-invalid />
        <Textarea placeholder="Anything we should plan around?" rows={3} />
      </Specimen>

      <Specimen name="Field" note="Label, description and error, composed" className="block">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ds-name">Journey name</FieldLabel>
            <Input id="ds-name" placeholder="Kashi & Ayodhya, December" />
            <FieldDescription>Only you and anyone you share with will see this.</FieldDescription>
          </Field>
          <FieldSeparator />
          <Field data-invalid>
            <FieldLabel htmlFor="ds-days">Days</FieldLabel>
            <Input id="ds-days" defaultValue="0" aria-invalid />
            <FieldError>A journey needs at least one day.</FieldError>
          </Field>
        </FieldGroup>
      </Specimen>

      <Specimen name="Checkbox, Radio & Switch" className="block space-y-4">
        <FieldSet>
          <FieldLegend variant="label">Carry</FieldLegend>
          <div className="flex flex-col gap-2">
            {["Prasadam box", "Warm layer", "Printed summary"].map((label, i) => (
              <Label key={label} className="flex items-center gap-2 font-normal">
                <Checkbox defaultChecked={i === 0} />
                {label}
              </Label>
            ))}
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Priority</FieldLegend>
          <RadioGroup defaultValue="Protected" className="flex flex-col gap-2">
            {TIERS.map((tier) => (
              <Label key={tier} className="flex items-center gap-2 font-normal">
                <RadioGroupItem value={tier} />
                {tier}
              </Label>
            ))}
          </RadioGroup>
        </FieldSet>

        <div className="flex items-center gap-6">
          <Label className="flex items-center gap-2 font-normal">
            <Switch defaultChecked />
            Offline maps
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <Switch />
            Push alerts
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <Switch disabled />
            Disabled
          </Label>
        </div>
      </Specimen>

      <Specimen name="Slider" className="block space-y-6">
        <Slider defaultValue={[40]} aria-label="Single value" />
        <Slider defaultValue={[20, 70]} aria-label="Range" />
      </Specimen>

      <Specimen name="Select & NativeSelect">
        <Select defaultValue="tight">
          <SelectTrigger className="w-56" aria-label="Journey health">
            <SelectValue placeholder="Journey health" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comfortable">Comfortable</SelectItem>
            <SelectItem value="tight">Tight</SelectItem>
            <SelectItem value="at-risk">At risk</SelectItem>
            <SelectItem value="broken">Broken</SelectItem>
          </SelectContent>
        </Select>

        <NativeSelect defaultValue="te" className="w-56" aria-label="Language">
          <NativeSelectOption value="en">English</NativeSelectOption>
          <NativeSelectOption value="te">తెలుగు</NativeSelectOption>
          <NativeSelectOption value="hi">हिन्दी</NativeSelectOption>
        </NativeSelect>
      </Specimen>

      <Specimen name="InputGroup" className="block space-y-3">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search temples, towns, routes" />
        </InputGroup>
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>https://</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput placeholder="source.example.org" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton>Verify</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Specimen>

      <Specimen name="InputOTP">
        <InputOTP maxLength={6} aria-label="One-time code">
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </Specimen>

      <Specimen name="Calendar" className="block">
        <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border" />
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => setDate(new Date())}>
            Today
          </Button>
        </div>
      </Specimen>
    </Section>
  );
}
