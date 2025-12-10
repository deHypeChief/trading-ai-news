# Smart Money Calendar - Development Plan

## Feature 1: AI Economic Calendar
- [ ] Set up Groq API wrapper for relevance scoring
- [ ] Set up Groq API wrapper for volatility predictions
- [ ] Integrate Trading Economics API (with Forex Factory fallback)
- [ ] Build calendar data ingestion pipeline
- [ ] Create real-time calendar update system (WebSocket)
- [ ] Build calendar filtering system (by impact, currency, date range)
- [ ] Design and implement calendar UI component
- [ ] Add color-coded relevance score display (0-100)
- [ ] Add volatility labels (Low/Medium/High/Extreme)
- [ ] Implement event detail expansion/modal
- [ ] Add historical volatility charts for events
- [ ] Optimize calendar load time (<2 seconds)

## Feature 2: Payment Integration
- [ ] Set up Paystack API integration
- [ ] Set up Cryptomus API integration
- [ ] Create payment initialization endpoint
- [ ] Implement payment verification webhook handlers
- [ ] Create subscription plans in both systems
- [ ] Build payment UI flow (checkout page)
- [ ] Implement automatic subscription renewal
- [ ] Add payment failure retry logic
- [ ] Send payment confirmation emails
- [ ] Create cancel subscription flow
- [ ] Store payment method references (masked)
- [ ] Add admin refund capability

## Feature 3: User Dashboard
- [x] Build dashboard layout and navigation
- [x] Create "Today's Events" card component
- [x] Create "Upcoming 48h High-Impact" section
- [x] Add quick access to calculator
- [x] Display subscription status widget
- [ ] Add timezone auto-detection
- [ ] Allow timezone adjustment
- [ ] Make dashboard mobile-responsive
- [ ] Optimize dashboard load time (<1.5s)

## Feature 4: Alert System (Email & Web Push)
  - [ ] Integrate email service (SMTP nodemailer)
  - [ ] Set up  for push notifications
- [ ] Create alert trigger scheduler (checks every 5 min)
- [ ] Build email alert templates
- [ ] Implement pre-event email alerts (30min/1h/2h before)
- [ ] Implement web push notification logic
- [ ] Add alert settings management page
- [ ] Add relevance threshold configuration
- [ ] Implement quiet hours feature

## Feature 5: Position Size Calculator
- [ ] Build calculator form component
- [ ] Implement position size calculation logic
- [ ] Add support for forex lot types (standard/mini/micro)
- [ ] Add support for index contracts
- [ ] Create calculation results display
- [ ] Add tooltips for each input field
- [ ] Implement save default settings
- [ ] Add "volatility-adjusted" toggle
- [ ] Integrate AI volatility predictions into calculator
- [ ] Add printable/shareable results
- [ ] Make calculator mobile-optimized

## Backend Infrastructure
- [x] Set up Node.js + Express server (Bun + Elysia)
- [x] Configure MongoDB with Mongoose
- [x] Set up Redis cache layer
- [x] Implement JWT authentication
- [x] Set up refresh token system
- [x] Configure CORS security
- [x] Implement rate limiting
- [x] Set up input validation/sanitization
- [x] Set up environment variable management
- [ ] Create database backup automation

## User Authentication & Account
- [x] Build user registration endpoint
- [x] Implement password hashing (bcrypt)
- [x] Create login endpoint with JWT
- [ ] Build forgot password flow
- [ ] Implement account settings page
- [ ] Add password change functionality
- [ ] Create user preferences storage
- [ ] Add instrument selection management
- [ ] Build account deletion flow (30-day grace period)
- [ ] Add data export feature (JSON)

## Frontend Setup
- [x] Initialize React.js project
- [x] Set up Tailwind CSS
- [x] Configure Vite build system
- [x] Set up routing (React Router)
- [x] Create layout components
- [x] Build navigation component
- [x] Implement state management (Auth Context)
- [ ] Set up WebSocket client connection
- [x] Configure API client
- [x] Add error handling/toast notifications

## Landing Page
- [x] Design hero section
- [x] Build feature showcase
- [x] Create pricing display section
- [x] Add social proof/testimonials area (placeholder)
- [x] Build CTA buttons
- [x] Create footer with links
- [x] Make responsive for mobile
- [ ] Optimize SEO

## Authentication Pages
- [x] Build signup/create account page with validation
- [x] Build login page with remember me
- [x] Create auth context for state management
- [x] Build auth API client integration
- [x] Set up protected routes
- [x] Link landing page to auth flows
- [ ] Build forgot password flow
- [ ] Build password reset page
- [ ] Add email verification flow

## AI & Data Processing
- [ ] Set up scheduled job for calendar data ingestion
- [ ] Create background job for AI scoring
- [ ] Implement cache invalidation strategy
- [ ] Set up data normalization pipeline
- [ ] Create fallback mechanism for AI failures
- [ ] Build logging system for AI predictions
- [ ] Implement A/B testing framework for models
- [ ] Create feedback collection system for accuracy

---

## Summary

**Total estimated tasks: ~150+**

**Priority order for MVP:**
1. Backend foundation (auth, DB, APIs)
2. Calendar feature + AI integration
3. Dashboard + UI
4. Alerts system
5. Payments integration
6. Calculator
7. Testing & deployment

**Project Tech Stack:**
- Frontend: React.js, Tailwind CSS, Vite
- Backend: Bun + Elyisa
- Database: MongoDB (Mongoose)
- Cache: Redis
- AI: Groq API wrapper
- Payments: Paystack + Cryptomus
- Email: SMTP (nodemailer)
- Push Notifications: handled by the backend
- Hosting: Docker + CI/CD
