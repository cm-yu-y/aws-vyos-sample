import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Config } from '../config/types';

export class TgwForVpnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps, config: Config) {
    super(scope, id, props);

    const projectName = config.project.name;

    // Create IAM role for EC2 instances to use SSM
    const ec2SsmRole = new iam.Role(this, 'EC2SSMRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
      roleName: `${projectName}-EC2SSMRole`,
    });

    // VPC 1
    const vpc1 = new ec2.Vpc(this, 'VPC1', {
      ipAddresses: ec2.IpAddresses.cidr(config.network.tokyo.vpc1.cidr),
      availabilityZones: ['ap-northeast-1c'],
      createInternetGateway: false,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          name: 'EC2',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
        {
          name: 'TGW-Attachment',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // VPC 2
    const vpc2 = new ec2.Vpc(this, 'VPC2', {
      ipAddresses: ec2.IpAddresses.cidr(config.network.tokyo.vpc2.cidr),
      availabilityZones: ['ap-northeast-1c'],
      createInternetGateway: false,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          name: 'EC2',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
        {
          name: 'TGW-Attachment',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // VPC Endpoint Security Group for VPC1
    const vpcEndpointSecurityGroup = new ec2.SecurityGroup(this, 'VPCEndpointSG1', {
      vpc: vpc1,
      description: 'Security group for VPC endpoints in VPC1',
      allowAllOutbound: false,
    });

    // Security Groups for test instances (defined early for VPC endpoint reference)
    const testSecurityGroup1 = new ec2.SecurityGroup(this, 'TestSecurityGroup1', {
      vpc: vpc1,
      description: 'Security group for test instances in VPC1',
      allowAllOutbound: true,
    });

    // Allow HTTPS inbound for VPC endpoints from EC2 security group only
    vpcEndpointSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(testSecurityGroup1.securityGroupId),
      ec2.Port.tcp(443),
      'Allow HTTPS from test instances'
    );

    // SSM VPC Endpoints for VPC1
    vpc1.addInterfaceEndpoint('SSMVPCEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      subnets: {
        subnetGroupName: 'EC2',
      },
      securityGroups: [vpcEndpointSecurityGroup],
      privateDnsEnabled: true,
    });

    vpc1.addInterfaceEndpoint('SSMMessagesVPCEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: {
        subnetGroupName: 'EC2',
      },
      securityGroups: [vpcEndpointSecurityGroup],
      privateDnsEnabled: true,
    });


    // VPC Endpoint Security Group for VPC2
    const vpcEndpointSecurityGroup2 = new ec2.SecurityGroup(this, 'VPCEndpointSG2', {
      vpc: vpc2,
      description: 'Security group for VPC endpoints in VPC2',
      allowAllOutbound: false,
    });

    // Security Group for VPC2 test instances (defined early for VPC endpoint reference)
    const testSecurityGroup2 = new ec2.SecurityGroup(this, 'TestSecurityGroup2', {
      vpc: vpc2,
      description: 'Security group for test instances in VPC2',
      allowAllOutbound: true,
    });

    vpcEndpointSecurityGroup2.addIngressRule(
      ec2.Peer.securityGroupId(testSecurityGroup2.securityGroupId),
      ec2.Port.tcp(443),
      'Allow HTTPS from test instances in VPC2'
    );

    // SSM VPC Endpoints for VPC2
    vpc2.addInterfaceEndpoint('SSMVPCEndpoint2', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      subnets: {
        subnetGroupName: 'EC2',
      },
      securityGroups: [vpcEndpointSecurityGroup2],
      privateDnsEnabled: true,
    });

    vpc2.addInterfaceEndpoint('SSMMessagesVPCEndpoint2', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: {
        subnetGroupName: 'EC2',
      },
      securityGroups: [vpcEndpointSecurityGroup2],
      privateDnsEnabled: true,
    });


    // Transit Gateway
    const tgw = new ec2.CfnTransitGateway(this, 'TransitGateway', {
      description: 'Tokyo region TGW for Site-to-Site VPN testing',
      amazonSideAsn: config.transitGateway.asn,
      defaultRouteTableAssociation: 'disable',
      defaultRouteTablePropagation: 'disable',
      tags: [
        {
          key: 'Name',
          value: `${projectName}-tokyo-tgw`,
        },
      ],
    });

    // Unified Route Table for TGW
    const unifiedRouteTable = new ec2.CfnTransitGatewayRouteTable(this, 'UnifiedRouteTable', {
      transitGatewayId: tgw.ref,
      tags: [
        {
          key: 'Name',
          value: `${projectName}-unified-route-table`,
        },
      ],
    });

    // TGW Attachment for VPC1
    const tgwAttachment1 = new ec2.CfnTransitGatewayVpcAttachment(this, 'TGWAttachment1', {
      transitGatewayId: tgw.ref,
      vpcId: vpc1.vpcId,
      subnetIds: vpc1.selectSubnets({
        subnetGroupName: 'TGW-Attachment',
      }).subnetIds,
      tags: [
        {
          key: 'Name',
          value: `${projectName}-vpc1-tgw-attachment`,
        },
      ],
    });

    // TGW Attachment for VPC2
    const tgwAttachment2 = new ec2.CfnTransitGatewayVpcAttachment(this, 'TGWAttachment2', {
      transitGatewayId: tgw.ref,
      vpcId: vpc2.vpcId,
      subnetIds: vpc2.selectSubnets({
        subnetGroupName: 'TGW-Attachment',
      }).subnetIds,
      tags: [
        {
          key: 'Name',
          value: `${projectName}-vpc2-tgw-attachment`,
        },
      ],
    });

    // Associate Unified Route Table with Attachments
    new ec2.CfnTransitGatewayRouteTableAssociation(this, 'VPC1RouteTableAssociation', {
      transitGatewayAttachmentId: tgwAttachment1.ref,
      transitGatewayRouteTableId: unifiedRouteTable.ref,
    });

    new ec2.CfnTransitGatewayRouteTableAssociation(this, 'VPC2RouteTableAssociation', {
      transitGatewayAttachmentId: tgwAttachment2.ref,
      transitGatewayRouteTableId: unifiedRouteTable.ref,
    });

    // Route Propagation (optional - enable if you want automatic route learning)
    new ec2.CfnTransitGatewayRouteTablePropagation(this, 'VPC1RouteTablePropagation', {
      transitGatewayAttachmentId: tgwAttachment1.ref,
      transitGatewayRouteTableId: unifiedRouteTable.ref,
    });

    new ec2.CfnTransitGatewayRouteTablePropagation(this, 'VPC2RouteTablePropagation', {
      transitGatewayAttachmentId: tgwAttachment2.ref,
      transitGatewayRouteTableId: unifiedRouteTable.ref,
    });

    // Static Routes for VPC-to-VPC communication
    new ec2.CfnTransitGatewayRoute(this, 'VPC1Route', {
      transitGatewayRouteTableId: unifiedRouteTable.ref,
      destinationCidrBlock: config.network.tokyo.vpc1.cidr,
      transitGatewayAttachmentId: tgwAttachment1.ref,
    });

    new ec2.CfnTransitGatewayRoute(this, 'VPC2Route', {
      transitGatewayRouteTableId: unifiedRouteTable.ref,
      destinationCidrBlock: config.network.tokyo.vpc2.cidr,
      transitGatewayAttachmentId: tgwAttachment2.ref,
    });

    // Route for Osaka VPC (to be used after VPN attachment is created)
    // This route will need to be added manually or through additional CDK after VPN setup:
    // aws ec2 create-route --route-table-id <unified-route-table-id> \
    //   --destination-cidr-block 192.168.0.0/16 \
    //   --transit-gateway-attachment-id <vpn-attachment-id>

    // Allow ICMP (ping) from VPC2 and local VPC1
    testSecurityGroup1.addIngressRule(
      ec2.Peer.ipv4(config.network.tokyo.vpc1.cidr),
      ec2.Port.allIcmp(),
      'Allow ICMP from VPC1'
    );

    testSecurityGroup1.addIngressRule(
      ec2.Peer.ipv4(config.network.tokyo.vpc2.cidr),
      ec2.Port.allIcmp(),
      'Allow ICMP from VPC2'
    );

    // Allow ICMP from Osaka on-premises via VPN
    testSecurityGroup1.addIngressRule(
      ec2.Peer.ipv4(config.network.osaka.vpc.cidr),
      ec2.Port.allIcmp(),
      'Allow ICMP from Osaka via VPN'
    );

    // Allow HTTPS outbound to VPC endpoints
    testSecurityGroup1.addEgressRule(
      ec2.Peer.securityGroupId(vpcEndpointSecurityGroup.securityGroupId),
      ec2.Port.tcp(443),
      'Allow HTTPS to VPC endpoints'
    );


    // Allow ICMP (ping) from VPC1 and local VPC2
    testSecurityGroup2.addIngressRule(
      ec2.Peer.ipv4(config.network.tokyo.vpc1.cidr),
      ec2.Port.allIcmp(),
      'Allow ICMP from VPC1'
    );

    testSecurityGroup2.addIngressRule(
      ec2.Peer.ipv4(config.network.tokyo.vpc2.cidr),
      ec2.Port.allIcmp(),
      'Allow ICMP from VPC2'
    );

    // Allow ICMP from Osaka on-premises via VPN
    testSecurityGroup2.addIngressRule(
      ec2.Peer.ipv4(config.network.osaka.vpc.cidr),
      ec2.Port.allIcmp(),
      'Allow ICMP from Osaka via VPN'
    );

    // Allow HTTPS outbound to VPC endpoints
    testSecurityGroup2.addEgressRule(
      ec2.Peer.securityGroupId(vpcEndpointSecurityGroup2.securityGroupId),
      ec2.Port.tcp(443),
      'Allow HTTPS to VPC endpoints'
    );

    // Test EC2 instance in VPC1
    const testInstance1 = new ec2.Instance(this, 'TestInstance1', {
      vpc: vpc1,
      vpcSubnets: {
        subnetGroupName: 'EC2',
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass[config.ec2.testInstanceType.split('.')[0].toUpperCase() as keyof typeof ec2.InstanceClass],
        ec2.InstanceSize[config.ec2.testInstanceType.split('.')[1].toUpperCase() as keyof typeof ec2.InstanceSize]
      ),
      machineImage: new ec2.GenericLinuxImage({
        [config.aws.regions.tokyo]: config.ec2.testInstanceAmiId,
      }),
      securityGroup: testSecurityGroup1,
      userData: ec2.UserData.forLinux(),
      role: ec2SsmRole,
    });

    // Test EC2 instance in VPC2
    const testInstance2 = new ec2.Instance(this, 'TestInstance2', {
      vpc: vpc2,
      vpcSubnets: {
        subnetGroupName: 'EC2',
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass[config.ec2.testInstanceType.split('.')[0].toUpperCase() as keyof typeof ec2.InstanceClass],
        ec2.InstanceSize[config.ec2.testInstanceType.split('.')[1].toUpperCase() as keyof typeof ec2.InstanceSize]
      ),
      machineImage: new ec2.GenericLinuxImage({
        [config.aws.regions.tokyo]: config.ec2.testInstanceAmiId,
      }),
      securityGroup: testSecurityGroup2,
      userData: ec2.UserData.forLinux(),
      role: ec2SsmRole,
    });

    // Outputs
    new cdk.CfnOutput(this, 'TGWId', {
      value: tgw.ref,
      description: 'Transit Gateway ID',
    });

    new cdk.CfnOutput(this, 'VPC1Id', {
      value: vpc1.vpcId,
      description: 'VPC1 ID',
    });

    new cdk.CfnOutput(this, 'VPC2Id', {
      value: vpc2.vpcId,
      description: 'VPC2 ID',
    });

    new cdk.CfnOutput(this, 'TestInstance1Id', {
      value: testInstance1.instanceId,
      description: 'Test Instance 1 ID',
    });

    new cdk.CfnOutput(this, 'TestInstance2Id', {
      value: testInstance2.instanceId,
      description: 'Test Instance 2 ID',
    });

  }
}