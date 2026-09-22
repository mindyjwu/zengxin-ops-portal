# Zengxin LTC Portal - Role-Based Testing Plan

> **Out of date:** this plan describes a 6-role redesign (ceo/manager/hr/training/accountant/staff) that is not in `ltc-portal.html`. The portal currently has 3 built roles (admin, hr, manager); see `__tests__/portal.e2e.test.js` for the tested behavior.

## Test Objectives
Verify that the 6-role RBAC system correctly restricts/allows access to:
- Sensitive employee data (salary, performance, insurance, contact info)
- Module features based on role permissions
- Cross-facility data visibility
- Leave approval workflows

---

## Role Definitions & Permissions Matrix

| Feature | CEO | Manager | HR | Training | Accountant | Staff |
|---------|-----|---------|----|-----------|-----------| ------|
| View all facilities | ✅ | ✅* | ✅ | ✅ | ✅ | ❌ |
| View employee salary | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| View performance rating | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View contact/ID info | ✅ | ❌ | ✅ | ❌ | ❌ | Own only |
| Edit employee records | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve leave requests | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Access Reports | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Access Settings | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

*Manager: can see all if cross-office assumption toggle is ON

---

## Testing Procedure

### Phase 1: Employee Records Module (HR → Employee records tab)

#### Test 1.1: CEO Role
- [ ] Log in as CEO (execute long)
- [ ] Verify can see all 27 employees across 3 facilities
- [ ] Verify salary column is visible
- [ ] Verify performance rating column is visible
- [ ] Verify contact info (phone, email, ID) is visible
- [ ] Verify insurance info is visible
- [ ] Click on an employee → verify all sensitive fields shown in person drawer
- [ ] Try to edit an employee record → verify edit button works

#### Test 1.2: Manager Role
- [ ] Switch to Manager role
- [ ] Verify can see employees from manager's facility (O1 - 誠馨院)
- [ ] Verify salary column is HIDDEN (shows "隱藏" / "Hidden")
- [ ] Verify performance rating is visible
- [ ] Verify contact info is HIDDEN
- [ ] Verify insurance is HIDDEN
- [ ] Click on employee from own facility → verify drawer shows performance but hides salary/contact
- [ ] Try to view employee from different facility (if cross-office OFF) → should be restricted
- [ ] Toggle cross-office assumption ON → verify can now see other facilities

#### Test 1.3: HR Role
- [ ] Switch to HR role
- [ ] Verify can see all 27 employees
- [ ] Verify salary column is visible
- [ ] Verify performance rating is HIDDEN
- [ ] Verify contact info is visible
- [ ] Verify insurance is visible
- [ ] Click employee → drawer shows salary/contact/insurance but NOT performance

#### Test 1.4: Training Specialist Role
- [ ] Switch to Training Specialist
- [ ] Verify Employee Records tab is accessible but very limited
- [ ] Should see minimal data (likely just names and facilities)
- [ ] Verify cannot see salary, performance, or sensitive data

#### Test 1.5: Accountant Role
- [ ] Switch to Accountant
- [ ] Verify can see employees
- [ ] Verify salary column is visible
- [ ] Verify performance is HIDDEN
- [ ] Verify contact info is HIDDEN
- [ ] Verify insurance is HIDDEN

#### Test 1.6: Staff Role
- [ ] Switch to Staff (persona E2103 - nurse at O1)
- [ ] Verify can ONLY see own record
- [ ] Verify "View own only" alert appears
- [ ] Verify cannot access other employees' records
- [ ] Click own record → drawer shows own data only

---

### Phase 2: Leave Approval Workflow (HR → Leave approvals tab)

#### Test 2.1: CEO Role
- [ ] View leave approval tab
- [ ] Verify can see all pending leave requests (12 pending)
- [ ] Verify "Approve" button available
- [ ] Verify "Reject" button available
- [ ] Try approving a request → should work (no actual save needed for prototype)

#### Test 2.2: Manager Role
- [ ] View leave tab
- [ ] Verify can see leave requests for own facility staff
- [ ] Verify can approve/reject own staff's requests
- [ ] If cross-office ON, verify can see/approve other facilities

#### Test 2.3: HR Role
- [ ] View leave tab
- [ ] Verify can see all requests (including rejected/approved history)
- [ ] Verify can finalize approvals
- [ ] Verify "HR Countersign" function available

#### Test 2.4: Training/Accountant/Staff Roles
- [ ] Switch to each role
- [ ] Verify leave tab shows but with read-only permission
- [ ] Training Specialist should see minimal data
- [ ] Staff should only see own pending leave requests

---

### Phase 3: Reports Module (Reports Export tab)

#### Test 3.1: Permission-Based Access
- [ ] CEO → should access all 5 report tabs (Attendance, Personnel, Leave, Financial, Service)
- [ ] Manager → should access all 5 report tabs
- [ ] HR → should access all 5 report tabs
- [ ] Accountant → should access Financial tab primarily
- [ ] Training Specialist → should have NO access (disabled)
- [ ] Staff → should have NO access (disabled)

#### Test 3.2: Report Content by Role
- [ ] CEO: Verify can generate reports with "All facilities" filter
- [ ] Manager: Verify can generate reports (should see own facility default)
- [ ] HR: Verify Personnel report shows sensitive fields (salary, insurance)
- [ ] Accountant: Verify Financial report accessible, salary data shown

---

### Phase 4: Settings Module (Settings tab)

#### Test 4.1: Admin-Only Features
- [ ] CEO → should see all 4 settings tabs (General, Account, Security, Notifications)
- [ ] Manager → should see General + Account tabs (limited security)
- [ ] HR → should see General + Account tabs
- [ ] Training/Accountant/Staff → should have LIMITED or NO access

#### Test 4.2: Security Settings
- [ ] CEO: Verify can see Security tab with MFA, IP whitelist, audit log options
- [ ] Manager: Verify Security tab is hidden or read-only

---

### Phase 5: Announcements Module (Announcements → Board tab)

#### Test 5.1: Announcement Visibility by Scope
- [ ] CEO: Should see ALL group + facility announcements
- [ ] Manager: Should see group announcements + own facility
- [ ] HR: Should see all (same as CEO for announcements)
- [ ] Training/Accountant: Should see group announcements only
- [ ] Staff: Should see group announcements + own facility

#### Test 5.2: Org Chart & Directory (Announcements → Org chart & Directory tabs)
- [ ] CEO: Should see all staff
- [ ] Manager: Should see own facility staff + managers above
- [ ] Staff: Should see own facility staff
- [ ] All roles: Directory should show/hide contact info based on permissions

---

### Phase 6: UI/UX Testing

#### Test 6.1: Bilingual UI
- [ ] Toggle between 中文 (Chinese) and EN (English) via language buttons
- [ ] Verify all UI elements switch language
- [ ] Verify both languages display correctly (no broken characters)
- [ ] Test in each module to ensure consistency

#### Test 6.2: Responsive Design
- [ ] Test on desktop (1920x1080) ✅
- [ ] Test on tablet (768px width)
- [ ] Test on mobile (375px width)
- [ ] Verify tables and forms are readable

#### Test 6.3: Dark/Light Theme
- [ ] Toggle dark mode (if implemented)
- [ ] Verify readability in both themes
- [ ] Check color contrast meets accessibility standards

---

### Phase 7: Cross-Role Scenarios

#### Test 7.1: Leave Approval Workflow (Multi-step)
1. **Staff submits leave request** → Switch to Staff role, file leave request
2. **Manager approves** → Switch to Manager, navigate to Leave tab, approve
3. **HR countersigns** → Switch to HR, finalize approval
4. **Verify status changes** → Switch back to Staff, check request status

#### Test 7.2: Employee Data Edit Workflow
1. **HR edits employee salary** → Switch to HR, find employee, edit salary field
2. **Manager views edited data** → Switch to Manager, verify salary is still hidden
3. **CEO views edited data** → Switch to CEO, verify salary shows updated value

#### Test 7.3: Report Generation by Role
1. **Accountant generates financial report** → Switch to Accountant, Reports → Financial tab, generate
2. **Manager tries to access full payroll** → Switch to Manager, Personnel report should show limited data
3. **HR exports full report** → Switch to HR, Personnel report shows all fields

---

## Expected Failure Modes (Known Limitations)

- [ ] Actual data persistence (reports don't save to CSV/PDF - prototype only)
- [ ] Leave approvals don't actually update status (UI only)
- [ ] Employee edits don't persist (browser memory only)
- [ ] No backend authentication (role switcher is for demo purposes)
- [ ] No audit logging (audit tab is UI mockup only)

---

## Test Results Template

**Tester Name:** _______________  
**Test Date:** _______________  
**Browser:** _______________  

### Summary
- Total Tests: 
- Passed: 
- Failed: 
- Known Issues:

### Issues Found
| Role | Module | Feature | Expected | Actual | Severity |
|------|--------|---------|----------|--------|----------|
|      |        |         |          |        |          |

---

## Next Steps After Testing
1. [ ] Document all permission violations found
2. [ ] Verify no sensitive data leakage across roles
3. [ ] Confirm all UI elements properly hidden/shown
4. [ ] Test with actual users from each role group
5. [ ] Iterate on permission matrix based on feedback
