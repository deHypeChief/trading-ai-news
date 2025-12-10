/* eslint-disable react/react-in-jsx-scope */
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Zap, TrendingUp, AlertCircle, Calculator, Calendar, CheckCircle2, ArrowRight } from "lucide-react";

function Navbar() {
    return (
        <nav className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur">
            <div className="flex justify-between items-center py-5 px-20">
                <div className="flex items-center space-x-20">
                    <div className="flex items-center gap-2">
                        <Zap className="h-6 w-6 text-blue-600" />
                        <h1 className="text-2xl font-bold">SMC</h1>
                    </div>
                    <div className="space-x-8 hidden md:flex">
                        <Link to="/" className="text-gray-700 hover:text-black">Home</Link>
                        <a href="#features" className="text-gray-700 hover:text-black">Features</a>
                        <a href="#pricing" className="text-gray-700 hover:text-black">Pricing</a>
                    </div>
                </div>
                <div className="space-x-4">
                    <Link to="/login">
                        <Button className="rounded-full" size="lg" variant="outline">Login</Button>
                    </Link>
                    <Link to="/signup">
                        <Button className="rounded-full" size="lg">Create Account</Button>
                    </Link>
                </div>
            </div>
        </nav>
    );
}

function Footer() {
    return (
        <footer className="border-t bg-gray-50 ">
            <div className="max-w-7xl mx-auto px-20">
                {/* <div className="grid grid-cols-4 gap-8 mb-8">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Zap className="h-5 w-5 text-blue-600" />
                            <span className="font-bold">SMC</span>
                        </div>
                        <p className=" text-sm">AI-powered trading intelligence</p>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-4">Product</h4>
                        <div className="space-y-2 text-sm ">
                            <a href="#" className="hover:text-black">Calendar</a>
                            <a href="#" className="hover:text-black">Calculator</a>
                            <a href="#" className="hover:text-black">Alerts</a>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-4">Legal</h4>
                        <div className="space-y-2 text-sm">
                            <a href="#" className="hover:text-black">Terms of Service</a>
                            <a href="#" className="hover:text-black">Privacy Policy</a>
                            <a href="#" className="hover:text-black">Disclaimer</a>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-4">Contact</h4>
                        <div className="space-y-2 text-sm">
                            <a href="mailto:support@smartmoneycal.com">support@smartmoneycal.com</a>
                            <p>Live chat: Mon-Fri 9am-5pm EST</p>
                        </div>
                    </div>
                </div> */}
                <div className=" py-8 text-center text-sm">
                    &copy; {new Date().getFullYear()} Smart Money Calendar. All rights reserved.
                </div>
            </div>
        </footer>
    )
}

function Features() {
    const features = [
        {
            icon: <TrendingUp className="h-8 w-8 text-blue-600" />,
            title: "AI Relevance Scoring",
            description: "Events ranked 0-100 based on their actual impact to your trading pairs"
        },
        {
            icon: <AlertCircle className="h-8 w-8 text-blue-600" />,
            title: "Smart Alerts",
            description: "Email & push notifications for high-impact events that matter to you"
        },
        {
            icon: <Calculator className="h-8 w-8 text-blue-600" />,
            title: "Position Calculator",
            description: "Risk-adjusted position sizing based on expected volatility"
        },
        {
            icon: <Calendar className="h-8 w-8 text-blue-600" />,
            title: "Real-Time Calendar",
            description: "Live updates with forecast vs actual economic indicators"
        }
    ]

    return (
        <section id="features" className="py-20 px-20 bg-white">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-5xl font-bold mb-4">Everything you need to trade smarter</h2>
                    <p className="text-xl text-gray-600">Stop guessing. Start knowing which events actually impact your trades.</p>
                </div>
                <div className="grid grid-cols-2 gap-8">
                    {features.map((feature, i) => (
                        <div key={i} className="p-8 border rounded-lg hover:shadow-lg transition">
                            <div className="mb-4">{feature.icon}</div>
                            <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                            <p className="text-gray-600">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

function Pricing() {
    return (
        <section id="pricing" className="py-20 px-20 bg-gray-50">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-5xl font-bold mb-4">Simple, transparent pricing</h2>
                    <p className="text-xl text-gray-600">No hidden fees. Cancel anytime.</p>
                </div>
                <div className="grid grid-cols-2 gap-8 max-w-2xl mx-auto">
                    {/* Monthly */}
                    <div className="bg-white p-8 rounded-lg border">
                        <h3 className="text-2xl font-bold mb-2">Monthly</h3>
                        <div className="mb-6">
                            <span className="text-5xl font-bold">$1</span>
                            <span className="text-gray-600">/month</span>
                        </div>
                        <Button className="w-full rounded-full mb-6">Start Free Trial</Button>
                        <div className="space-y-3">
                            <div className="flex gap-3 items-center">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span>AI-powered calendar</span>
                            </div>
                            <div className="flex gap-3 items-center">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span>Smart alerts</span>
                            </div>
                            <div className="flex gap-3 items-center">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span>Position calculator</span>
                            </div>
                            <div className="flex gap-3 items-center">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span>Crypto payments</span>
                            </div>
                        </div>
                    </div>

                    {/* Yearly */}
                    <div className="bg-black text-white p-8 rounded-lg border-2 border-black relative">
                        <div className="absolute -top-4 left-4 bg-green-500 px-3 py-1 rounded-full text-sm font-semibold">
                            Save 42%
                        </div>
                        <h3 className="text-2xl font-bold mb-2">Yearly</h3>
                        <div className="mb-6">
                            <span className="text-5xl font-bold">$7</span>
                            <span className="opacity-90">/year</span>
                        </div>
                        <Button className="w-full rounded-full mb-6 bg-white text-black hover:bg-gray-100">Start Free Trial</Button>
                        <div className="space-y-3">
                            <div className="flex gap-3 items-center">
                                <CheckCircle2 className="h-5 w-5 text-green-300" />
                                <span>AI-powered calendar</span>
                            </div>
                            <div className="flex gap-3 items-center">
                                <CheckCircle2 className="h-5 w-5 text-green-300" />
                                <span>Smart alerts</span>
                            </div>
                            <div className="flex gap-3 items-center">
                                <CheckCircle2 className="h-5 w-5 text-green-300" />
                                <span>Position calculator</span>
                            </div>
                            <div className="flex gap-3 items-center">
                                <CheckCircle2 className="h-5 w-5 text-green-300" />
                                <span>Crypto payments</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

export default function LandingPage() {
    return (
        <div>
            {/* Hero Section */}
            <div className="px-24 from-blue-50 to-white">
                <Navbar />
                <div className="pt-32 h-screen flex items-end pb-32">
                    <div>
                        <div className="flex gap-3 items-center pb-3">
                            <div className="h-4 w-4 bg-green-500 rounded-full" />
                            <p className="text-gray-700">1000+ active traders already using SMC</p>
                        </div>
                        <h1 className="text-7xl md:text-8xl font- capitalize leading-tight mb-6">
                            AI-powered<br />economic calendar
                        </h1>
                        <p className="text-xl text-gray-600 mb-8 max-w-2xl">
                            Know which economic events actually matter for your trades. Get AI-scored relevance and volatility predictions no more guessing.
                        </p>
                        <div className="pt-6 space-x-6">
                            <Link to="/signup">
                                <Button className="rounded-full py-6 text-lg  px-28" size="lg">
                                    Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                            <Link to="/signup">
                                <Button className="rounded-full px-8 py-6 text-lg" size="lg" variant="outline">
                                    View Calendar
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Pricing Section */}
                <Pricing />
                <Footer />
            </div>
        </div>
    )
}