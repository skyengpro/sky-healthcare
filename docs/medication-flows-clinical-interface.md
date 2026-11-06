# Medication flows with the clinical interface

People in blue, applications in purple or green. Solid arrows: actions. Dotted arrows: responses or results.

## 1. Register a patient

```mermaid
sequenceDiagram
    autonumber
    box rgb(232,240,254) People
        actor PAT as Patient
        actor ACC as Reception
    end
    box rgb(237,231,246) Applications
        participant APP as Clinical interface
        participant HC as Healthcare and ERPNext
    end

    PAT->>ACC: Presents themselves (identity, phone number)
    ACC->>APP: Searches for the patient by name or phone number
    alt Patient already registered
        APP-->>ACC: Opens their dashboard
    else New patient
        ACC->>APP: Fills in the record and saves
        APP->>HC: Creates the patient
        APP-->>ACC: Opens the new patient's dashboard
    end
    ACC-->>PAT: Directs them to the doctor
```

## 2. Requisition and stock receipt

```mermaid
sequenceDiagram
    autonumber
    box rgb(232,240,254) People
        actor SRV as Care unit
        actor MAG as Stock manager
        actor PA as Supply point
    end
    box rgb(237,231,246) Applications
        participant APP as Clinical interface
        participant STK as Healthcare and ERPNext
    end

    SRV->>APP: Adds a need (products, quantities)
    Note over APP: A product below its alert threshold<br/>is flagged in the stock status
    APP->>STK: Records the requisition
    MAG->>APP: Opens the requisition and selects "Fulfill"
    APP-->>MAG: Stock receipt prefilled with the requested products
    PA-->>MAG: Delivers the products
    MAG->>APP: Completes each line (batch, expiry date, quantity, price) and submits
    APP->>STK: Creates the batches, records the receipt, closes the requisition
    STK-->>APP: Stock increased
    APP-->>SRV: Requisition fulfilled
```

A delivery without a requisition goes directly through the "Stock receipt" screen, with the same fields.

## 3. Consultation, procedure and dispensing

```mermaid
sequenceDiagram
    autonumber
    box rgb(232,240,254) People
        actor PAT as Patient
        actor MED as Doctor
        actor INF as Nurse
    end
    box rgb(237,231,246) Applications
        participant APP as Clinical interface
        participant HC as Healthcare and ERPNext
    end

    MED->>APP: From the dashboard, opens a new consultation
    MED->>APP: Enters the reason for visit, diagnosis and prescriptions, then saves
    APP->>HC: Saves and submits the consultation, creates the orders
    opt Test prescribed
        MED->>APP: Enters the result when it arrives (optional)
    end
    INF->>APP: Opens the prescribed procedure or dispensing
    APP-->>INF: Medications and consumables proposed, with the available stock
    INF->>PAT: Administers the procedure or hands over the medications
    INF->>APP: Adjusts the quantities used and saves
    alt Insufficient stock
        APP-->>INF: Save refused, product to be added to the requisitions
    else Sufficient stock
        APP->>HC: Creates the procedure, submits it and completes it
        HC-->>APP: Stock decreased (batch expiring first), patient indicated
        APP-->>INF: Procedure added to the patient's dashboard
    end
```

## 4. Remove expired medications

```mermaid
sequenceDiagram
    autonumber
    box rgb(232,240,254) People
        actor MAG as Stock manager
        actor ELI as Disposal service
    end
    box rgb(237,231,246) Applications
        participant APP as Clinical interface
        participant STK as Healthcare and ERPNext
    end

    Note over STK: At all times, issues never take an expired batch<br/>and use the batch that expires earliest first
    APP-->>MAG: The stock status flags expired and soon-to-expire batches
    MAG->>APP: Opens "Non-patient issue", reason Expired
    APP-->>MAG: Expired batches listed with their quantities
    MAG->>MAG: Physically removes the boxes
    MAG->>APP: Adjusts the quantities if needed and submits
    APP->>STK: Records the issue with the reason
    STK-->>APP: Stock decreased batch by batch
    MAG->>ELI: Hands over the medications for disposal
```
